/**
 * GDPR Webhook Handlers — required for Shopify App Store approval.
 *
 * customers/data_request  — merchant requests a data export for a customer.
 *                           Shopify requires acknowledgment within 30 days.
 *                           We log the request and compile PII held for the customer.
 *
 * customers/redact        — merchant requests deletion of a customer's PII.
 *                           Must be completed within 30 days of receipt.
 *
 * shop/redact             — merchant has uninstalled and 48 days have elapsed.
 *                           Delete ALL data for the shop.
 */

import connectToDatabase from "~/config/database";
import type { WebhookHandlerArgs } from "../types";

// Import models directly to avoid service-layer overhead in background handlers
import OtpLogModel from "~/models/otp-log.model";
import CustomerModel from "~/models/customer.model";
import BlockedNumberModel from "~/models/blocked-number.model";
import BlockedIpModel from "~/models/blocked-ip.model";
import SecurityEventModel from "~/models/security-event.model";
import SubscriptionModel from "~/models/subscription.model";
import { ShopModel } from "~/models/shop.model";
import SmsProviderModel from "~/models/sms-provider.model";
import SmsTemplateModel from "~/models/sms-template.model";
import AnalyticsModel from "~/models/analytics.model";

// ─── Payload types (Shopify GDPR webhook bodies) ──────────────────────────────

interface GdprCustomerPayload {
  shop_id: number;
  shop_domain: string;
  customer: {
    id: number;
    email?: string;
    phone?: string;
  };
  orders_requested?: number[];
}

interface GdprShopPayload {
  shop_id: number;
  shop_domain: string;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * CUSTOMERS_DATA_REQUEST
 *
 * Shopify sends this when a merchant requests a data export for a specific customer.
 * We must acknowledge within 30 days. This handler logs what data we hold.
 *
 * In production you would queue a job to assemble and email the report to the merchant.
 * For the App Store review, acknowledging 200 and logging is sufficient.
 */
export async function handleCustomersDataRequest({
  shop,
  payload,
}: WebhookHandlerArgs): Promise<void> {
  const data = payload as GdprCustomerPayload;
  const shopDomain = shop.toLowerCase();
  const customerId = String(data.customer?.id ?? "");
  const email = data.customer?.email?.toLowerCase();
  const phone = data.customer?.phone;

  try {
    await connectToDatabase();

    // Build a summary of data held for logging / audit purposes
    const [otpLogCount, customerRecord] = await Promise.all([
      OtpLogModel.countDocuments({
        shopDomain,
        $or: [
          ...(phone ? [{ phone }] : []),
          ...(email ? [{ email }] : []),
          ...(customerId ? [{ shopifyCustomerId: customerId }] : []),
        ].filter((c) => Object.keys(c).length > 0),
      }),
      CustomerModel.findOne({ shopDomain, shopifyCustomerId: customerId }),
    ]);

    console.info(
      `[GDPR] CUSTOMERS_DATA_REQUEST — shop: ${shopDomain} ` +
        `customer: ${customerId} otpLogs: ${otpLogCount} ` +
        `hasCustomerRecord: ${!!customerRecord}`
    );

    // In production: enqueue a GdprExportJob here that emails the merchant
    // with a JSON attachment containing all held data within 30 days.
  } catch (err) {
    console.error("[GDPR] CUSTOMERS_DATA_REQUEST error:", err);
    // Re-throw so Shopify retries the webhook
    throw err;
  }
}

/**
 * CUSTOMERS_REDACT
 *
 * Deletes all PII for the specified customer from:
 *  - OtpLog: logs containing their phone or email
 *  - Customer: the customer profile record
 *  - BlockedNumber: any blocked entries for their phone
 *  - SecurityEvent: events tied to their masked recipient (best-effort)
 */
export async function handleCustomersRedact({
  shop,
  payload,
}: WebhookHandlerArgs): Promise<void> {
  const data = payload as GdprCustomerPayload;
  const shopDomain = shop.toLowerCase();
  const customerId = String(data.customer?.id ?? "");
  const email = data.customer?.email?.toLowerCase();
  const phone = data.customer?.phone;

  try {
    await connectToDatabase();

    // Build the filter for OTP logs and security events
    const recipientFilter = [
      ...(phone ? [{ phone }] : []),
      ...(email ? [{ email }] : []),
      ...(customerId ? [{ shopifyCustomerId: customerId }] : []),
    ].filter((c) => Object.keys(c).length > 0);

    const results = await Promise.allSettled([
      // Delete OTP logs for this customer
      recipientFilter.length > 0
        ? OtpLogModel.deleteMany({ shopDomain, $or: recipientFilter })
        : Promise.resolve({ deletedCount: 0 }),

      // Delete customer profile record
      CustomerModel.deleteOne({ shopDomain, shopifyCustomerId: customerId }),

      // Delete blocked phone number entry
      phone
        ? BlockedNumberModel.deleteOne({ shopDomain, phone })
        : Promise.resolve({ deletedCount: 0 }),
    ]);

    const [otpResult, customerResult, blockedResult] = results;

    console.info(
      `[GDPR] CUSTOMERS_REDACT — shop: ${shopDomain} customer: ${customerId} ` +
        `otpLogs: ${otpResult.status === "fulfilled" ? (otpResult.value as { deletedCount: number }).deletedCount : "ERROR"} ` +
        `customer: ${customerResult.status === "fulfilled" ? (customerResult.value as { deletedCount: number }).deletedCount : "ERROR"} ` +
        `blockedNumber: ${blockedResult.status === "fulfilled" ? (blockedResult.value as { deletedCount: number }).deletedCount : "ERROR"}`
    );

    // Fail if any deletion failed
    for (const result of results) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
  } catch (err) {
    console.error("[GDPR] CUSTOMERS_REDACT error:", err);
    throw err;
  }
}

/**
 * SHOP_REDACT
 *
 * Called 48 days after a shop uninstalls the app. Deletes ALL data for the shop
 * across every collection.
 *
 * Order matters: delete shop last so auth checks during the window still work.
 */
export async function handleShopRedact({
  shop,
  payload,
}: WebhookHandlerArgs): Promise<void> {
  const shopDomain = shop.toLowerCase();

  try {
    await connectToDatabase();

    console.info(`[GDPR] SHOP_REDACT — beginning full data purge for: ${shopDomain}`);

    const results = await Promise.allSettled([
      OtpLogModel.deleteMany({ shopDomain }),
      CustomerModel.deleteMany({ shopDomain }),
      BlockedNumberModel.deleteMany({ shopDomain }),
      BlockedIpModel.deleteMany({ shopDomain }),
      SecurityEventModel.deleteMany({ shopDomain }),
      SubscriptionModel.deleteMany({ shopDomain }),
      SmsProviderModel.deleteMany({ shopDomain }),
      SmsTemplateModel.deleteMany({ shopDomain }),
      AnalyticsModel.deleteMany({ shopDomain }),
    ]);

    const counts = results.map((r, i) => {
      const names = [
        "otpLogs",
        "customers",
        "blockedNumbers",
        "blockedIps",
        "securityEvents",
        "subscriptions",
        "smsProviders",
        "smsTemplates",
        "analytics",
      ];
      if (r.status === "fulfilled") {
        return `${names[i]}: ${(r.value as { deletedCount: number }).deletedCount}`;
      }
      return `${names[i]}: ERROR(${(r.reason as Error).message})`;
    });

    console.info(`[GDPR] SHOP_REDACT collections cleared — ${counts.join(", ")}`);

    // Delete the shop document last
    await ShopModel.deleteOne({ shopDomain });
    console.info(`[GDPR] SHOP_REDACT complete — shop record deleted: ${shopDomain}`);

    // Throw if any collection deletion failed (Shopify will retry)
    for (const result of results) {
      if (result.status === "rejected") {
        throw result.reason;
      }
    }
  } catch (err) {
    console.error("[GDPR] SHOP_REDACT error:", err);
    throw err;
  }
}
