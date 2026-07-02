import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { MongoSessionStorage } from "~/lib/session-storage/mongo-session-storage.server";
import { shopService } from "~/services/shop.service";
import { env } from "~/config/env";

const shopify = shopifyApp({
  apiKey: env.SHOPIFY_API_KEY,
  apiSecretKey: env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.January25,
  scopes: env.SCOPES.split(","),
  appUrl: env.SHOPIFY_APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new MongoSessionStorage(),
  distribution: AppDistribution.AppStore,
  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    CUSTOMERS_DATA_REQUEST: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    CUSTOMERS_REDACT: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
    SHOP_REDACT: {
      deliveryMethod: "http" as const,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      // Register webhooks on every auth — ensures they're always current
      void shopify.registerWebhooks({ session });

      // Sync shop details from Shopify Admin API to MongoDB
      try {
        const response = await admin.graphql(
          `#graphql
          query GetShopInfo {
            shop {
              id
              name
              email
              ianaTimezone
              currencyCode
              billingAddress {
                countryCodeV2
              }
            }
          }`
        );

        const { data } = (await response.json()) as {
          data?: {
            shop?: {
              id: string;
              name: string;
              email: string;
              ianaTimezone: string;
              currencyCode: string;
              billingAddress?: { countryCodeV2: string };
            };
          };
        };

        const shopInfo = data?.shop;

        await shopService.getOrCreateShop({
          shopDomain: session.shop,
          shopId: shopInfo?.id ?? session.shop,
          accessToken: session.accessToken ?? "",
          scope: session.scope ?? "",
          email: shopInfo?.email ?? "",
          name: shopInfo?.name ?? session.shop,
          country: shopInfo?.billingAddress?.countryCodeV2 ?? "",
          currency: shopInfo?.currencyCode ?? "",
          timezone: shopInfo?.ianaTimezone ?? "",
        });

        console.info(`[Shopify] Shop synced after auth: ${session.shop}`);
      } catch (error) {
        // Non-fatal: the auth still succeeds; shop will be synced on next login
        console.error(`[Shopify] Failed to sync shop after auth:`, error);
      }
    },
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
