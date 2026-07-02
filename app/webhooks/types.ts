import type { Session } from "@shopify/shopify-api";

export interface WebhookHandlerArgs {
  topic: string;
  shop: string;
  session?: Session;
  admin?: unknown;
  payload: unknown;
}

export type WebhookHandler = (args: WebhookHandlerArgs) => Promise<void>;
