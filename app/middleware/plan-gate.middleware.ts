import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { planService } from "~/services/plan.service";
import { ForbiddenError } from "~/utils/errors";

type GateArgs = LoaderFunctionArgs | ActionFunctionArgs;

/**
 * Checks if the authenticated shop's plan includes the given feature.
 * Throws a ForbiddenError if the feature is not available.
 *
 * Usage:
 *   export const loader = async (args) => {
 *     await requireFeature(args, "emailOtp");
 *     ...
 *   };
 */
export async function requireFeature(
  args: GateArgs,
  feature: string
): Promise<void> {
  const { session } = await authenticate.admin(args.request);
  const result = await planService.hasFeature(session.shop, feature);

  if (!result.success || !result.data) {
    throw new ForbiddenError(
      `Your current plan does not include: ${feature}. Please upgrade to access this feature.`
    );
  }
}

/**
 * Returns true/false for a feature check without throwing.
 * Use this when you want to conditionally show/hide UI elements.
 */
export async function checkFeature(
  shopDomain: string,
  feature: string
): Promise<boolean> {
  const result = await planService.hasFeature(shopDomain, feature);
  return result.success && (result.data ?? false);
}

/**
 * Redirects to the billing upgrade page if the feature is unavailable.
 */
export async function requireFeatureOrRedirect(
  args: GateArgs,
  feature: string,
  redirectTo = "/app/billing"
): Promise<void> {
  const { session } = await authenticate.admin(args.request);
  const result = await planService.hasFeature(session.shop, feature);

  if (!result.success || !result.data) {
    throw redirect(redirectTo);
  }
}
