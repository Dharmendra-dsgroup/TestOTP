/**
 * Post-OTP login handler.
 *
 * POST /api/auth/login
 *
 * This is the server-side leg of the "OTP verified → logged into Shopify" flow.
 *
 * Flow:
 *   1. Widget verifies OTP → gets sessionToken from /api/otp/verify
 *   2. Widget POSTs sessionToken to this endpoint (never in a URL)
 *   3. Shopify App Proxy forwards the POST here
 *   4. We consume the one-time session token from Redis (60s TTL)
 *   5. IP + User-Agent binding is validated against the verify request
 *   6. Admin GraphQL: find-or-create Shopify customer by phone/email
 *   7. Generate login URL (Multipass for Plus, activation URL for new customers,
 *      or Customer Account API OAuth for existing non-Plus customers)
 *   8. Redirect customer to that URL → they land on Shopify account page, logged in
 *
 * Security:
 * - Token is in POST body — never in URL, browser history, or server access logs
 * - Token is one-time-use (GETDEL)
 * - Token is bound to the verifying IP address and User-Agent
 * - Token is tied to shop domain (cross-shop replay is rejected)
 * - Proxy signature is validated before anything else
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  validateProxySignature,
  extractShopFromProxy,
  isProxySignatureRequired,
} from "~/lib/shopify/proxy-auth.server";
import {
  consumeLoginSession,
  extractClientIp,
  hashUserAgent,
} from "~/lib/auth/login-session.server";
import { customerService } from "~/services/customer.service";
import { shopRepository } from "~/repositories/shop.repository";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
};

// ─── POST handler (primary) ───────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (isProxySignatureRequired() && !validateProxySignature(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Extract binding values from the incoming request
  const incomingIp = extractClientIp(request);
  const incomingUaHash = hashUserAgent(request.headers.get("user-agent") ?? "");

  // Read token from POST body
  let token: string | null = null;
  let bodyShop: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json() as Record<string, string>;
      token = body.token ?? null;
      bodyShop = body.shop ?? null;
    } else {
      const formData = await request.formData();
      token = formData.get("token") as string | null;
      bodyShop = formData.get("shop") as string | null;
    }
  } catch {
    return redirect("/account?login_error=invalid_request", { headers: SECURITY_HEADERS });
  }

  const shopDomain =
    extractShopFromProxy(request) ?? bodyShop;

  if (!token || !shopDomain) {
    return redirect("/account?login_error=invalid_token", { headers: SECURITY_HEADERS });
  }

  // Consume one-time session with IP + UA binding validation
  const session = await consumeLoginSession(token, shopDomain, incomingIp, incomingUaHash);
  if (!session) {
    return redirect("/account?login_error=session_expired", { headers: SECURITY_HEADERS });
  }

  // Get the shop's redirect preference
  const shopDoc = await shopRepository.findByDomain(shopDomain);
  const returnTo = shopDoc?.settings?.loginRedirectUrl ?? "/account";

  // Find/create Shopify customer and generate login URL
  const result = await customerService.findOrCreateAndLogin(
    shopDomain,
    {
      phone: session.phone,
      email: session.email,
      channel: session.channel,
    },
    returnTo
  );

  if (!result.success) {
    console.error("[LoginHandler] Customer login failed:", result.error);
    return redirect("/account?login_error=login_failed", { headers: SECURITY_HEADERS });
  }

  return redirect(result.data.loginUrl, { status: 302, headers: SECURITY_HEADERS });
};

// ─── GET handler — graceful rejection (token must never appear in a URL) ─────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Reject GET requests. If the widget is using the old GET flow (cached version),
  // send the customer to the account page with an informative error.
  console.warn("[LoginHandler] GET request received — widget must POST the token, not redirect via URL");
  return redirect("/account?login_error=session_expired");
};
