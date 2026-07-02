/**
 * Shopify Billing API — server-side wrapper.
 *
 * All mutations and queries talk to the Shopify Admin GraphQL API using the
 * shop's access token (loaded from the DB via ShopRepository).
 *
 * Design:
 *  - Never throws — returns ServiceResult<T>
 *  - Uses native fetch() with 10s AbortController timeout
 *  - Always verifies userErrors before returning success
 */

import type {
  ShopifyCreateSubscriptionResult,
  ShopifyCancelSubscriptionResult,
  ShopifyActiveSubscriptionsResult,
  ShopifyAppSubscriptionNode,
  CreateSubscriptionResult,
} from "~/types/billing.types";
import type { PlanDefinition } from "~/config/plans";
import { shopRepository } from "~/repositories/shop.repository";
import {
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "~/types/common.types";
import { env } from "~/config/env";

const SHOPIFY_API_VERSION = "2025-01";

// ─── GraphQL documents ────────────────────────────────────────────────────────

const GQL_CREATE_SUBSCRIPTION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $test: Boolean
    $trialDays: Int
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      lineItems: $lineItems
      test: $test
      trialDays: $trialDays
    ) {
      userErrors { field message }
      confirmationUrl
      appSubscription {
        id
        name
        status
        createdAt
        currentPeriodEnd
        trialDays
        test
      }
    }
  }
`;

const GQL_CANCEL_SUBSCRIPTION = `
  mutation AppSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      userErrors { field message }
      appSubscription {
        id
        status
      }
    }
  }
`;

const GQL_ACTIVE_SUBSCRIPTIONS = `
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        createdAt
        currentPeriodEnd
        trialDays
        test
      }
    }
  }
`;

// ─── ShopifyBillingClient ─────────────────────────────────────────────────────

class ShopifyBillingClient {
  /**
   * Creates a Shopify recurring app subscription and returns the
   * confirmation URL the merchant must visit to approve billing.
   */
  async createSubscription(
    shopDomain: string,
    plan: PlanDefinition,
    returnUrl: string
  ): Promise<ServiceResult<CreateSubscriptionResult>> {
    const accessToken = await this._getAccessToken(shopDomain);
    if (!accessToken) {
      return serviceFailure("Shop access token not found", 404);
    }

    const isTest = env.NODE_ENV !== "production";

    const variables = {
      name: `OTP Login Pro — ${plan.name}`,
      returnUrl,
      test: isTest,
      trialDays: plan.trialDays > 0 ? plan.trialDays : undefined,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: plan.price.toFixed(2),
                currencyCode: "USD",
              },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    };

    const result = await this._gql<ShopifyCreateSubscriptionResult>(
      shopDomain,
      accessToken,
      GQL_CREATE_SUBSCRIPTION,
      variables
    );

    if (!result.success) return result;

    const { data } = result;
    const userErrors = data.appSubscriptionCreate.userErrors;
    if (userErrors.length > 0) {
      return serviceFailure(
        `Shopify billing error: ${userErrors.map((e) => e.message).join("; ")}`,
        422
      );
    }

    const { confirmationUrl, appSubscription } =
      data.appSubscriptionCreate;

    if (!confirmationUrl || !appSubscription) {
      return serviceFailure(
        "Shopify did not return a confirmation URL",
        500
      );
    }

    return serviceSuccess({
      confirmationUrl,
      shopifySubscriptionId: appSubscription.id,
    });
  }

  /**
   * Cancels an active Shopify subscription.
   * This is idempotent — cancelling an already-cancelled subscription
   * returns a userError which we treat as success.
   */
  async cancelSubscription(
    shopDomain: string,
    shopifySubscriptionId: string
  ): Promise<ServiceResult<{ status: string }>> {
    const accessToken = await this._getAccessToken(shopDomain);
    if (!accessToken) {
      return serviceFailure("Shop access token not found", 404);
    }

    const result = await this._gql<ShopifyCancelSubscriptionResult>(
      shopDomain,
      accessToken,
      GQL_CANCEL_SUBSCRIPTION,
      { id: shopifySubscriptionId }
    );

    if (!result.success) return result;

    const { data } = result;
    const userErrors = data.appSubscriptionCancel.userErrors;

    // Treat "already cancelled" as a non-error
    const nonFatalPhrases = ["already", "not found", "cannot cancel"];
    const fatal = userErrors.filter(
      (e) => !nonFatalPhrases.some((p) => e.message.toLowerCase().includes(p))
    );
    if (fatal.length > 0) {
      return serviceFailure(
        `Shopify cancel error: ${fatal.map((e) => e.message).join("; ")}`,
        422
      );
    }

    const status =
      data.appSubscriptionCancel.appSubscription?.status ?? "CANCELLED";
    return serviceSuccess({ status });
  }

  /**
   * Fetches all currently active subscriptions from Shopify for a shop.
   * Used after a merchant approves billing to confirm activation.
   */
  async getActiveSubscriptions(
    shopDomain: string
  ): Promise<ServiceResult<ShopifyAppSubscriptionNode[]>> {
    const accessToken = await this._getAccessToken(shopDomain);
    if (!accessToken) {
      return serviceFailure("Shop access token not found", 404);
    }

    const result = await this._gql<ShopifyActiveSubscriptionsResult>(
      shopDomain,
      accessToken,
      GQL_ACTIVE_SUBSCRIPTIONS,
      {}
    );

    if (!result.success) return result;

    return serviceSuccess(
      result.data.currentAppInstallation.activeSubscriptions
    );
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private async _getAccessToken(shopDomain: string): Promise<string | null> {
    const shopDoc = await shopRepository.findByDomainWithToken(shopDomain);
    return shopDoc?.accessToken ?? null;
  }

  private async _gql<T>(
    shopDomain: string,
    accessToken: string,
    query: string,
    variables: Record<string, unknown>
  ): Promise<ServiceResult<T>> {
    const url = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return serviceFailure(
          `Shopify Admin API error: ${response.status} ${response.statusText}`,
          response.status >= 500 ? 502 : 422
        );
      }

      const json = (await response.json()) as { data?: T; errors?: unknown[] };

      if (json.errors && Array.isArray(json.errors) && json.errors.length > 0) {
        return serviceFailure(
          `Shopify GraphQL errors: ${JSON.stringify(json.errors)}`,
          422
        );
      }

      if (!json.data) {
        return serviceFailure("Empty response from Shopify Admin API", 502);
      }

      return serviceSuccess(json.data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return serviceFailure("Shopify Admin API request timed out", 504);
      }
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Shopify Admin API request failed: ${msg}`, 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const shopifyBillingClient = new ShopifyBillingClient();
