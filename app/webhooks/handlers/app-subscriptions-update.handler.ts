import type { WebhookHandlerArgs } from "../types";
import { billingService } from "~/services/billing.service";

interface AppSubscriptionsUpdatePayload {
  app_subscription: {
    admin_graphql_api_id: string;
    name: string;
    status: string;
    admin_graphql_api_app_id: string;
    current_period_end: string | null;
    test: boolean;
    created_at: string;
    updated_at: string;
  };
}

export async function handleAppSubscriptionsUpdate({
  shop,
  payload,
}: WebhookHandlerArgs): Promise<void> {
  const data = payload as AppSubscriptionsUpdatePayload;
  const { app_subscription } = data;

  if (!app_subscription?.admin_graphql_api_id) {
    console.warn("[AppSubscriptionsUpdate] Missing admin_graphql_api_id in payload");
    return;
  }

  const result = await billingService.handleWebhookUpdate(shop, {
    app_subscription: {
      admin_graphql_api_id: app_subscription.admin_graphql_api_id,
      status: app_subscription.status,
      name: app_subscription.name,
      current_period_end: app_subscription.current_period_end,
    },
  });

  if (!result.success) {
    // Log and rethrow so the webhook router returns 500 → Shopify retries
    console.error(
      `[AppSubscriptionsUpdate] Failed for shop ${shop}: ${result.error}`
    );
    throw new Error(result.error);
  }
}
