import { customerRepository } from "~/repositories/customer.repository";
import { shopRepository } from "~/repositories/shop.repository";
import { analyticsService } from "./analytics.service";
import { decrypt } from "~/utils/crypto";
import {
  generateMultipassToken,
  buildMultipassUrl,
  type MultipassCustomerData,
} from "~/lib/shopify/multipass.server";
import { env } from "~/config/env";
import type { ICustomerDocument } from "~/models/customer.model";
import type { CustomerCreateInput } from "~/types/customer.types";
import type { OTP_CHANNEL } from "~/types/otp.types";
import {
  type ServiceResult,
  serviceSuccess,
  serviceFailure,
} from "~/types/common.types";

const SHOPIFY_API_VERSION = "2025-01";

// ─── Admin GraphQL fragments ──────────────────────────────────────────────────

const CUSTOMER_FIELDS = `
  id email phone firstName lastName state acceptsMarketing tags
`;

const GQL_SEARCH_BY_PHONE = `
  query($query: String!) {
    customers(first: 1, query: $query) {
      edges { node { ${CUSTOMER_FIELDS} } }
    }
  }
`;

const GQL_SEARCH_BY_EMAIL = `
  query($query: String!) {
    customers(first: 1, query: $query) {
      edges { node { ${CUSTOMER_FIELDS} } }
    }
  }
`;

const GQL_CUSTOMER_CREATE = `
  mutation CustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { ${CUSTOMER_FIELDS} }
      userErrors { field message }
    }
  }
`;

const GQL_ACTIVATION_URL = `
  mutation CustomerGenerateAccountActivationUrl($customerId: ID!) {
    customerGenerateAccountActivationUrl(customerId: $customerId) {
      accountActivationUrl
      userErrors { field message }
    }
  }
`;

interface ShopifyCustomerNode {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  state?: string;
  acceptsMarketing?: boolean;
  tags?: string[];
}

export interface CustomerLoginResult {
  shopifyCustomerId: string;
  shopifyGid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isNew: boolean;
  loginUrl: string;
  loginMethod: "activation_url" | "multipass";
}

export class CustomerService {
  async findOrCreateCustomer(
    data: CustomerCreateInput
  ): Promise<ServiceResult<{ customer: ICustomerDocument; isNew: boolean }>> {
    try {
      const existing = await customerRepository.findByShopifyId(
        data.shopDomain,
        data.shopifyCustomerId
      );

      if (existing) {
        return serviceSuccess({ customer: existing, isNew: false });
      }

      const created = await customerRepository.upsertByShopifyId(data);
      return serviceSuccess({ customer: created, isNew: true });
    } catch (error) {
      console.error("[CustomerService] findOrCreateCustomer failed:", error);
      return serviceFailure("Failed to find or create customer", 500);
    }
  }

  async getCustomerByPhone(
    shopDomain: string,
    phone: string
  ): Promise<ServiceResult<ICustomerDocument | null>> {
    try {
      const customer = await customerRepository.findByPhone(shopDomain, phone);
      return serviceSuccess(customer);
    } catch (error) {
      console.error("[CustomerService] getCustomerByPhone failed:", error);
      return serviceFailure("Failed to find customer", 500);
    }
  }

  async getCustomerByEmail(
    shopDomain: string,
    email: string
  ): Promise<ServiceResult<ICustomerDocument | null>> {
    try {
      const customer = await customerRepository.findByEmail(shopDomain, email);
      return serviceSuccess(customer);
    } catch (error) {
      console.error("[CustomerService] getCustomerByEmail failed:", error);
      return serviceFailure("Failed to find customer", 500);
    }
  }

  async isCustomerBlocked(
    shopDomain: string,
    shopifyCustomerId: string
  ): Promise<boolean> {
    try {
      const customer = await customerRepository.findByShopifyId(
        shopDomain,
        shopifyCustomerId
      );
      return customer?.isBlocked ?? false;
    } catch {
      return false;
    }
  }

  async recordLogin(
    shopDomain: string,
    shopifyCustomerId: string
  ): Promise<void> {
    try {
      await customerRepository.incrementLoginCount(shopDomain, shopifyCustomerId);
    } catch (error) {
      console.error("[CustomerService] recordLogin failed:", error);
    }
  }

  async markVerified(
    shopDomain: string,
    shopifyCustomerId: string,
    channel: "sms" | "email" | "whatsapp"
  ): Promise<ServiceResult<ICustomerDocument>> {
    try {
      const customer = await customerRepository.markPhoneVerified(
        shopDomain,
        shopifyCustomerId,
        channel
      );
      if (!customer) return serviceFailure("Customer not found", 404);
      return serviceSuccess(customer);
    } catch (error) {
      console.error("[CustomerService] markVerified failed:", error);
      return serviceFailure("Failed to mark customer as verified", 500);
    }
  }

  async blockCustomer(
    shopDomain: string,
    shopifyCustomerId: string,
    reason: string
  ): Promise<ServiceResult<ICustomerDocument>> {
    try {
      const customer = await customerRepository.blockCustomer(
        shopDomain,
        shopifyCustomerId,
        reason
      );
      if (!customer) return serviceFailure("Customer not found", 404);
      return serviceSuccess(customer);
    } catch (error) {
      console.error("[CustomerService] blockCustomer failed:", error);
      return serviceFailure("Failed to block customer", 500);
    }
  }
}

  // ─── Admin GraphQL: find-or-create + login URL ──────────────────────────────

  /**
   * Finds or creates a Shopify customer via Admin API, then generates a
   * one-time storefront login URL (activation URL or Multipass for Plus).
   */
  async findOrCreateAndLogin(
    shopDomain: string,
    identity: { phone?: string; email?: string; channel: OTP_CHANNEL },
    returnTo = "/account"
  ): Promise<ServiceResult<CustomerLoginResult>> {
    const shopDoc = await shopRepository.findByDomainWithToken(shopDomain);
    if (!shopDoc?.accessToken) {
      return serviceFailure("Shop access token not available", 500);
    }

    const accessToken = shopDoc.accessToken;
    const apiUrl = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    // Find existing customer
    let customer: ShopifyCustomerNode | null = null;
    if (identity.phone) customer = await this.adminFindByPhone(apiUrl, accessToken, identity.phone);
    if (!customer && identity.email) customer = await this.adminFindByEmail(apiUrl, accessToken, identity.email);

    const isNew = !customer;

    if (!customer) {
      customer = await this.adminCreateCustomer(apiUrl, accessToken, identity);
      if (!customer) return serviceFailure("Failed to create Shopify customer", 500);
    }

    // Sync to MongoDB (fire-and-forget)
    void this.syncToMongo(shopDomain, customer, identity).catch(() => {});

    // Generate login URL
    const loginResult = await this.buildLoginUrl(
      shopDomain, apiUrl, accessToken, customer,
      shopDoc.settings?.shopifyPlusEnabled ?? false,
      shopDoc.settings?.multipassSecret,
      returnTo
    );

    if (!loginResult) return serviceFailure("Failed to generate Shopify login URL", 500);

    void analyticsService.record(shopDomain, {
      ...(isNew ? { newCustomers: 1, registrationCount: 1 } : { returningCustomers: 1 }),
      loginCount: 1,
    });

    return serviceSuccess({
      shopifyCustomerId: customer.id.split("/").pop() ?? customer.id,
      shopifyGid: customer.id,
      email: customer.email ?? identity.email ?? "",
      firstName: customer.firstName,
      lastName: customer.lastName,
      isNew,
      loginUrl: loginResult.url,
      loginMethod: loginResult.method,
    });
  }

  private async adminFindByPhone(apiUrl: string, token: string, phone: string): Promise<ShopifyCustomerNode | null> {
    try {
      const data = await this.adminGql<{ customers: { edges: { node: ShopifyCustomerNode }[] } }>(
        apiUrl, token, GQL_SEARCH_BY_PHONE, { query: `phone:${phone}` }
      );
      return data?.customers?.edges?.[0]?.node ?? null;
    } catch { return null; }
  }

  private async adminFindByEmail(apiUrl: string, token: string, email: string): Promise<ShopifyCustomerNode | null> {
    try {
      const data = await this.adminGql<{ customers: { edges: { node: ShopifyCustomerNode }[] } }>(
        apiUrl, token, GQL_SEARCH_BY_EMAIL, { query: `email:${email}` }
      );
      return data?.customers?.edges?.[0]?.node ?? null;
    } catch { return null; }
  }

  private async adminCreateCustomer(
    apiUrl: string,
    token: string,
    identity: { phone?: string; email?: string }
  ): Promise<ShopifyCustomerNode | null> {
    try {
      const input: Record<string, unknown> = { tags: ["otp-login-pro"] };
      if (identity.phone) input.phone = identity.phone;
      if (identity.email) input.email = identity.email;

      const data = await this.adminGql<{
        customerCreate: { customer: ShopifyCustomerNode; userErrors: { message: string }[] };
      }>(apiUrl, token, GQL_CUSTOMER_CREATE, { input });

      if (data?.customerCreate?.userErrors?.length) {
        console.error("[CustomerService] Create error:", data.customerCreate.userErrors[0]?.message);
        return null;
      }
      return data?.customerCreate?.customer ?? null;
    } catch { return null; }
  }

  private async buildLoginUrl(
    shopDomain: string,
    apiUrl: string,
    token: string,
    customer: ShopifyCustomerNode,
    isPlus: boolean,
    encryptedMultipassSecret: string | undefined,
    returnTo: string
  ): Promise<{ url: string; method: "activation_url" | "multipass" } | null> {
    // Multipass: Plus stores with secret + customer has email
    if (isPlus && encryptedMultipassSecret && customer.email) {
      try {
        const secret = decrypt(encryptedMultipassSecret, env.ENCRYPTION_KEY);
        const data: MultipassCustomerData = {
          email: customer.email,
          created_at: new Date().toISOString(),
          first_name: customer.firstName,
          last_name: customer.lastName,
          return_to: returnTo,
          identifier: customer.id,
        };
        return {
          url: buildMultipassUrl(shopDomain, generateMultipassToken(data, secret)),
          method: "multipass",
        };
      } catch (err) {
        console.error("[CustomerService] Multipass failed, falling back to activation URL:", err);
      }
    }

    // Activation URL: all plans
    try {
      const data = await this.adminGql<{
        customerGenerateAccountActivationUrl: {
          accountActivationUrl?: string;
          userErrors: { message: string }[];
        };
      }>(apiUrl, token, GQL_ACTIVATION_URL, { customerId: customer.id });

      const result = data?.customerGenerateAccountActivationUrl;
      if (result?.userErrors?.length) {
        console.error("[CustomerService] Activation URL error:", result.userErrors[0]?.message);
        return null;
      }

      const activationUrl = result?.accountActivationUrl;
      if (!activationUrl) return null;

      // Append return_to if non-default
      const url = new URL(activationUrl);
      if (returnTo && returnTo !== "/account" && !url.searchParams.has("return_to")) {
        url.searchParams.set("return_to", returnTo);
      }
      return { url: url.toString(), method: "activation_url" };
    } catch (err) {
      console.error("[CustomerService] Activation URL generation failed:", err);
      return null;
    }
  }

  private async syncToMongo(
    shopDomain: string,
    customer: ShopifyCustomerNode,
    identity: { phone?: string; email?: string; channel: OTP_CHANNEL }
  ): Promise<void> {
    const numericId = customer.id.split("/").pop() ?? customer.id;
    await customerRepository.upsertByShopifyId({
      shopDomain,
      shopifyCustomerId: numericId,
      phone: identity.phone ?? customer.phone,
      email: identity.email ?? customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
    });
    await customerRepository.incrementLoginCount(shopDomain, numericId);
    const ch = identity.channel;
    if (ch === "sms" || ch === "whatsapp" || ch === "email") {
      await customerRepository.markPhoneVerified(
        shopDomain, numericId,
        ch === "email" ? "email" : "sms"
      );
    }
  }

  private async adminGql<T>(
    apiUrl: string,
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T | null> {
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!resp.ok) throw new Error(`Shopify Admin API HTTP ${resp.status}`);
    const json = (await resp.json()) as { data?: T; errors?: unknown[] };
    if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    return json.data ?? null;
  }
}

export const customerService = new CustomerService();
