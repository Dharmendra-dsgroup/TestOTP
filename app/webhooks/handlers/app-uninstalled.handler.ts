import type { WebhookHandlerArgs } from "../types";
import { shopService } from "~/services/shop.service";
import { sessionService } from "~/services/session.service";

export async function handleAppUninstalled({
  shop,
}: WebhookHandlerArgs): Promise<void> {
  console.info(`[Webhook] APP_UNINSTALLED processing — shop: ${shop}`);

  const [shopResult, sessionResult] = await Promise.allSettled([
    shopService.markShopUninstalled(shop),
    sessionService.deleteSessionsForShop(shop),
  ]);

  if (shopResult.status === "rejected") {
    console.error(
      `[Webhook] APP_UNINSTALLED — failed to mark shop uninstalled:`,
      shopResult.reason
    );
  }

  if (sessionResult.status === "rejected") {
    console.error(
      `[Webhook] APP_UNINSTALLED — failed to delete sessions:`,
      sessionResult.reason
    );
  }

  console.info(`[Webhook] APP_UNINSTALLED complete — shop: ${shop}`);
}
