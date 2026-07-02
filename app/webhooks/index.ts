import type { WebhookHandler } from "./types";
import { handleAppUninstalled } from "./handlers/app-uninstalled.handler";
import {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
} from "./handlers/gdpr.handler";
import { handleAppSubscriptionsUpdate } from "./handlers/app-subscriptions-update.handler";

export const webhookHandlers: Record<string, WebhookHandler> = {
  APP_UNINSTALLED: handleAppUninstalled,
  CUSTOMERS_DATA_REQUEST: handleCustomersDataRequest,
  CUSTOMERS_REDACT: handleCustomersRedact,
  SHOP_REDACT: handleShopRedact,
  APP_SUBSCRIPTIONS_UPDATE: handleAppSubscriptionsUpdate,
};
