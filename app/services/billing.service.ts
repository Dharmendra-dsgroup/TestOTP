/**
 * BillingService — orchestrates the full Shopify billing lifecycle.
 *
 * Responsibilities:
 *  - Initiate a subscription (creates Shopify charge, returns confirmationUrl)
 *  - Confirm activation after merchant approves (called by billing callback route)
 *  - Cancel a subscription
 *  - Handle webhook status updates from Shopify
 *  - Enforce plan OTP limits by querying the analytics collection
 *  - Sync Shop.billing fields from the subscription record
 *
 * Services NEVER throw. All methods return ServiceResult<T>.
 */

import { getPlan, isOverLimit, isNearLimit, PLANS } from "~/config/plans";
import type { PlanKey } from "~/config/plans";
import type {
  CreateSubscriptionResult,
  ActiveSubscriptionInfo,
  PlanLimitCheck,
  SubscriptionStatus,
  SubscriptionCreateInput,
} from "~/types/billing.types";
import { shopifyBillingClient } from "~/lib/shopify/billing.server";
import { subscriptionRepository } from "~/repositories/subscription.repository";
import { shopRepository } from "~/repositories/shop.repository";
import { AnalyticsModel } from "~/models/analytics.model";
import connectToDatabase from "~/config/database";
import {
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "~/types/common.types";
import { env } from "~/config/env";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shopifyStatusToLocal(s: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    ACTIVE: "active",
    PENDING: "pending",
    CANCELLED: "cancelled",
    DECLINED: "declined",
    FROZEN: "frozen",
    EXPIRED: "expired",
  };
  return map[s.toUpperCase()] ?? "pending";
}

function resolveEffectiveStatus(
  base: SubscriptionStatus,
  trialEndsAt: Date | null
): SubscriptionStatus {
  if (base === "active" && trialEndsAt && trialEndsAt > new Date()) {
    return "trial";
  }
  return base;
}

/** ISO year+month key: "2026-06" */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── BillingService ───────────────────────────────────────────────────────────

export class BillingService {
  /**
   * Creates a Shopify recurring subscription for the given plan.
   * Stores the pending subscription ID on the shop so the callback
   * route can match it without relying on query params.
   */
  async initiateSubscription(
    shopDomain: string,
    planKey: PlanKey
  ): Promise<ServiceResult<CreateSubscriptionResult>> {
    const plan = getPlan(planKey);

    if (plan.price === 0) {
      return serviceFailure(
        "The free plan does not require a subscription.",
        400
      );
    }

    // Callback URL after merchant approves/declines on Shopify
    const returnUrl = `${env.SHOPIFY_APP_URL}/app/billing/callback?shop=${encodeURIComponent(shopDomain)}`;

    const result = await shopifyBillingClient.createSubscription(
      shopDomain,
      plan,
      returnUrl
    );

    if (!result.success) return result;

    // Persist the pending GID so the callback can look it up
    await shopRepository.updateBilling(shopDomain, {
      pendingSubscriptionId: result.data.shopifySubscriptionId,
    });

    return serviceSuccess(result.data);
  }

  /**
   * Called after the merchant is redirected back from Shopify's billing page.
   * Fetches active subscriptions from Shopify to confirm activation, then
   * persists the subscription record and updates Shop.billing.
   */
  async confirmSubscription(
    shopDomain: string
  ): Promise<ServiceResult<ActiveSubscriptionInfo>> {
    const shopDoc = await shopRepository.findByDomain(shopDomain);
    if (!shopDoc) return serviceFailure("Shop not found", 404);

    const pendingId = shopDoc.billing?.pendingSubscriptionId;

    const activeResult = await shopifyBillingClient.getActiveSubscriptions(shopDomain);
    if (!activeResult.success) return activeResult;

    const subs = activeResult.data;

    // Match by pending GID if available; otherwise take the most recent
    const matched =
      (pendingId && subs.find((s) => s.id === pendingId)) ?? subs[0];

    if (!matched) {
      // Merchant declined — clear pending, downgrade to free
      await this._applyPlanToShop(shopDomain, "free", null, "pending");
      return serviceFailure(
        "No active subscription found. Billing was declined or cancelled.",
        402
      );
    }

    const planKey = this._planKeyFromName(matched.name);
    const plan = getPlan(planKey);
    const localStatus = shopifyStatusToLocal(matched.status);
    const trialEndsAt = matched.trialDays > 0
      ? new Date(Date.now() + matched.trialDays * 86_400_000)
      : null;
    const effectiveStatus = resolveEffectiveStatus(localStatus, trialEndsAt);
    const currentPeriodEnd = matched.currentPeriodEnd
      ? new Date(matched.currentPeriodEnd)
      : null;
    const now = new Date();

    // Upsert subscription record
    const existing = await subscriptionRepository.findByShopifyId(matched.id);
    if (existing) {
      await subscriptionRepository.updateByShopifyId(matched.id, {
        status: effectiveStatus,
        shopifyStatus: matched.status,
        activatedAt: existing.activatedAt ?? now,
        trialEndsAt,
        currentPeriodEnd,
      });
    } else {
      const input: SubscriptionCreateInput = {
        shopDomain: shopDomain.toLowerCase(),
        shopifySubscriptionId: matched.id,
        planKey,
        planName: plan.name,
        status: effectiveStatus,
        priceUsd: plan.price,
        trialDays: matched.trialDays,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd,
        activatedAt: now,
        cancelledAt: null,
        shopifyStatus: matched.status,
        isTest: matched.test,
      };
      await subscriptionRepository.createSubscription(input);
    }

    // Sync Shop.billing
    await this._applyPlanToShop(
      shopDomain,
      planKey,
      matched.id,
      effectiveStatus,
      trialEndsAt,
      currentPeriodEnd
    );

    return serviceSuccess({
      shopifySubscriptionId: matched.id,
      planKey,
      status: effectiveStatus,
      trialEndsAt,
      currentPeriodEnd,
    });
  }

  /**
   * Cancels the active subscription immediately.
   * Downgrades the shop to the free plan.
   */
  async cancelSubscription(
    shopDomain: string
  ): Promise<ServiceResult<{ planKey: PlanKey }>> {
    const shopDoc = await shopRepository.findByDomain(shopDomain);
    if (!shopDoc) return serviceFailure("Shop not found", 404);

    const shopifyId = shopDoc.billing?.shopifyChargeId;

    if (shopifyId) {
      const result = await shopifyBillingClient.cancelSubscription(
        shopDomain,
        shopifyId
      );
      if (!result.success) return result;

      await subscriptionRepository.updateByShopifyId(shopifyId, {
        status: "cancelled",
        shopifyStatus: "CANCELLED",
        cancelledAt: new Date(),
      });
    }

    await this._applyPlanToShop(shopDomain, "free", undefined, "cancelled");

    return serviceSuccess({ planKey: "free" });
  }

  /**
   * Processes an APP_SUBSCRIPTIONS_UPDATE webhook payload.
   * Shopify sends this when a subscription's status changes (activation,
   * cancellation, frozen due to failed payment, etc.).
   */
  async handleWebhookUpdate(
    shopDomain: string,
    payload: {
      app_subscription: {
        admin_graphql_api_id: string;
        status: string;
        name: string;
        current_period_end: string | null;
      };
    }
  ): Promise<ServiceResult<void>> {
    const gid = payload.app_subscription.admin_graphql_api_id;
    const rawStatus = payload.app_subscription.status;
    const localStatus = shopifyStatusToLocal(rawStatus);
    const currentPeriodEnd = payload.app_subscription.current_period_end
      ? new Date(payload.app_subscription.current_period_end)
      : null;

    // Update subscription record
    await subscriptionRepository.updateByShopifyId(gid, {
      status: localStatus,
      shopifyStatus: rawStatus,
      cancelledAt:
        localStatus === "cancelled" ? new Date() : undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    });

    // Derive plan from subscription name
    const planKey =
      localStatus === "cancelled" ||
      localStatus === "frozen" ||
      localStatus === "expired" ||
      localStatus === "declined"
        ? "free"
        : this._planKeyFromName(payload.app_subscription.name);

    const effectiveGid =
      localStatus === "active" || localStatus === "trial" ? gid : undefined;

    await this._applyPlanToShop(
      shopDomain,
      planKey,
      effectiveGid,
      localStatus,
      undefined,
      currentPeriodEnd ?? undefined
    );

    return serviceSuccess(undefined);
  }

  /**
   * Checks whether the shop has remaining OTP quota for this billing period.
   * Reads from the analytics collection — no separate counter to maintain.
   */
  async checkPlanLimit(
    shopDomain: string
  ): Promise<ServiceResult<PlanLimitCheck>> {
    const shopDoc = await shopRepository.findByDomain(shopDomain);
    if (!shopDoc) return serviceFailure("Shop not found", 404);

    const planKey = (shopDoc.billing?.planId ?? "free") as PlanKey;
    const plan = getPlan(planKey);

    // Unlimited plan — skip DB query
    if (plan.monthlyOtpLimit === -1) {
      return serviceSuccess({
        allowed: true,
        currentCount: 0,
        limit: -1,
        nearLimit: false,
      });
    }

    const monthKey = currentMonthKey();
    await connectToDatabase();
    const analytics = await AnalyticsModel.findOne({
      shopDomain: shopDomain.toLowerCase(),
      period: "monthly",
      periodKey: monthKey,
    }).exec();

    const currentCount = analytics?.otpSent ?? 0;
    const allowed = !isOverLimit(plan, currentCount);
    const nearLimit = allowed && isNearLimit(plan, currentCount);

    return serviceSuccess({
      allowed,
      currentCount,
      limit: plan.monthlyOtpLimit,
      nearLimit,
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _applyPlanToShop(
    shopDomain: string,
    planKey: PlanKey,
    shopifyChargeId: string | undefined | null,
    status: SubscriptionStatus,
    trialEndsAt?: Date | null,
    currentPeriodEnd?: Date | null
  ): Promise<void> {
    const plan = getPlan(planKey);
    await shopRepository.updateBilling(shopDomain, {
      planId: planKey,
      planName: plan.name,
      status,
      shopifyChargeId: shopifyChargeId ?? undefined,
      pendingSubscriptionId: undefined,
      otpLimitPerPeriod: plan.monthlyOtpLimit === -1
        ? 999_999_999
        : plan.monthlyOtpLimit,
      trialEndsAt: trialEndsAt ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    });
  }

  /** Derives a PlanKey from the Shopify subscription name we set at create time. */
  private _planKeyFromName(name: string): PlanKey {
    const lower = name.toLowerCase();
    if (lower.includes("enterprise")) return "enterprise";
    if (lower.includes("growth")) return "growth";
    if (lower.includes("starter")) return "starter";
    return "free";
  }
}

export const billingService = new BillingService();
