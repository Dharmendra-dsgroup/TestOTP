import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { webhookHandlers } from "~/webhooks";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  const handler = webhookHandlers[topic];

  if (!handler) {
    // Return 200 to avoid Shopify retrying for topics we don't handle yet
    console.warn(`[Webhook] No handler registered for topic: ${topic}`);
    return new Response(null, { status: 200 });
  }

  try {
    await handler({ topic, shop, session, admin, payload });
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error(`[Webhook] Handler failed for topic ${topic}:`, error);
    // Return 500 so Shopify retries
    return new Response("Webhook handler failed", { status: 500 });
  }
};
