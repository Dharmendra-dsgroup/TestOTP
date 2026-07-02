/**
 * Billing Callback — /app/billing/callback
 *
 * Shopify redirects merchants here after they approve or decline billing on
 * Shopify's confirmation page. This is a loader-only route that:
 *
 *   1. Authenticates the request (Shopify embedded app session)
 *   2. Calls BillingService.confirmSubscription() which:
 *        a. Fetches activeSubscriptions from Shopify Admin GraphQL
 *        b. Matches the pending GID stored on the shop
 *        c. Creates the Subscription record and syncs Shop.billing
 *   3. Redirects to /app/billing with a status message
 *
 * Shopify does NOT pass a charge_id for app subscriptions in the redirect URL —
 * we rely on the pendingSubscriptionId stored during initiateSubscription().
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { requireAdminAuth } from "~/middleware/auth.middleware";
import { billingService } from "~/services/billing.service";

export const loader = async (args: LoaderFunctionArgs) => {
  const { shop } = await requireAdminAuth(args);

  const result = await billingService.confirmSubscription(shop);

  if (!result.success) {
    // Merchant declined or an error occurred — redirect with error flag
    const msg = encodeURIComponent(result.error ?? "Billing confirmation failed");
    return redirect(`/app/billing?error=${msg}`);
  }

  const { planKey, status } = result.data;
  const isTrial = status === "trial";

  const successMsg = encodeURIComponent(
    isTrial
      ? `Your ${planKey} trial has started. Enjoy!`
      : `Successfully upgraded to the ${planKey} plan.`
  );

  return redirect(`/app/billing?success=${successMsg}`);
};

// No UI — this is a redirect-only route
export default function BillingCallback() {
  return null;
}
