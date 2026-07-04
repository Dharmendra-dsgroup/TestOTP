/**
 * Shopify Customer Account API — OAuth callback handler.
 *
 * GET /api/auth/customer-callback?code={code}&state={state}
 *
 * This route is the OAuth redirect URI registered in the Shopify Partner Dashboard.
 * It is accessed DIRECTLY by the customer's browser (not through the App Proxy).
 *
 * IMPORTANT: The redirect URI registered in Partner Dashboard must match exactly:
 *   https://{your-render-url}/api/auth/customer-callback
 *
 * Flow:
 *   1. Shopify redirects here after the customer authenticates
 *   2. Shopify has already set the customer's session cookie during the auth step
 *   3. We validate state (CSRF), exchange code for token (PKCE verification)
 *   4. Redirect customer to their store account page — they are logged in
 *
 * Error handling:
 *   - OAuth error / store not using New Customer Accounts: redirect to /account/login
 *   - Invalid/expired state: redirect to /account with error
 *   - Token exchange failure: redirect to /account/login with email hint
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  consumeOAuthState,
  exchangeCodeForToken,
} from "~/lib/shopify/customer-account-oauth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description") ?? oauthError ?? "unknown";

  // OAuth error — store likely doesn't have New Customer Accounts enabled, or customer denied
  if (oauthError || !code || !state) {
    console.warn(`[CAA Callback] OAuth error received: ${errorDesc}`);

    // Try to recover the shop domain from state so we can redirect somewhere sensible
    const stateData = state ? await consumeOAuthState(state) : null;
    if (stateData?.shopDomain) {
      const hint = stateData.email ? `?email=${encodeURIComponent(stateData.email)}` : "";
      return redirect(`https://${stateData.shopDomain}/account/login${hint}`);
    }
    // No state data — can't determine shop, use a relative fallback
    return redirect("/account?login_error=oauth_failed");
  }

  // Consume OAuth state (CSRF check + retrieve codeVerifier)
  const stateData = await consumeOAuthState(state);
  if (!stateData) {
    console.error("[CAA Callback] Invalid or expired OAuth state");
    return redirect("/account?login_error=session_expired");
  }

  const { shopDomain, returnTo, codeVerifier, email } = stateData;

  // Exchange auth code for customer access token (PKCE validation happens here)
  const tokens = await exchangeCodeForToken(shopDomain, code, codeVerifier);
  if (!tokens) {
    console.error(`[CAA Callback] Token exchange failed for shop ${shopDomain}`);
    const hint = email ? `?email=${encodeURIComponent(email)}` : "";
    return redirect(`https://${shopDomain}/account/login${hint}`);
  }

  console.info(`[CAA Callback] Customer authenticated via Customer Account API for ${shopDomain}`);

  // The customer's session cookie was set by Shopify during the OAuth authorize step.
  // Redirecting to /account will show them as logged in.
  return redirect(`https://${shopDomain}${returnTo}`);
};
