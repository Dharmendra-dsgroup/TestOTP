/**
 * Public API — Verify OTP
 *
 * POST /api/otp/verify
 *
 * Called by the Shopify theme extension (via Shopify App Proxy).
 *
 * Request body (JSON or form-encoded):
 *   shop      — Shopify store domain (e.g. "mystore.myshopify.com")
 *   requestId — 32-char hex token returned by /api/otp/generate
 *   code      — 4–8 digit OTP code entered by the customer
 *
 * Response 200 (verified):
 *   { verified: true, phone?, email?, channel, sessionToken, loginUrl }
 *
 * The widget MUST redirect to `loginUrl` immediately after receiving this response.
 * loginUrl → /apps/otp-login-pro/api/auth/login?token={sessionToken}&shop={shop}
 * → server-side login redirect (activation URL or Multipass) → customer logged in.
 *
 * Response 422 (wrong code):
 *   { error, code: "OTP_INVALID", remainingAttempts? }
 *
 * Response 4xx/5xx:
 *   { error: string, code: string }
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { otpService } from "~/services/otp.service";
import { otpVerifySchema } from "~/validators/otp.validator";
import { createLoginSession } from "~/lib/auth/login-session.server";
import {
  validateProxySignature,
  extractShopFromProxy,
  isProxySignatureRequired,
} from "~/lib/shopify/proxy-auth.server";
import { env } from "~/config/env";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  // Validate App Proxy HMAC signature
  if (isProxySignatureRequired() && !validateProxySignature(request)) {
    return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, {
      status: 401, headers: CORS_HEADERS,
    });
  }

  let raw: Record<string, unknown>;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      raw = await request.json();
    } else {
      const formData = await request.formData();
      raw = Object.fromEntries(formData.entries());
    }
  } catch {
    return json({ error: "Invalid request body", code: "INVALID_BODY" }, {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Use shop from proxy query param if present
  const proxyShop = extractShopFromProxy(request);
  if (proxyShop && !raw.shop) raw = { ...raw, shop: proxyShop };

  const parsed = otpVerifySchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return json(
      { error: firstError?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { shop, requestId, code } = parsed.data;

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const result = await otpService.verify({
    shopDomain: shop,
    requestId,
    code,
    ipAddress,
  });

  if (!result.success) {
    const status = result.statusCode ?? 422;
    return json(
      { error: result.error, code: httpCodeToErrorCode(status) },
      { status, headers: CORS_HEADERS }
    );
  }

  // Create a one-time login session (60s TTL) for the storefront → server redirect
  const sessionToken = await createLoginSession({
    shopDomain: shop,
    phone: result.data.phone,
    email: result.data.email,
    channel: result.data.channel,
    verifiedAt: Date.now(),
  });

  // Build the login URL that the theme widget will redirect to
  const loginUrl = `https://${shop}/apps/otp-login-pro/api/auth/login?token=${sessionToken}&shop=${encodeURIComponent(shop)}`;

  return json(
    {
      ...result.data,
      sessionToken,
      loginUrl,
    },
    { status: 200, headers: CORS_HEADERS }
  );
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, {
    status: 405,
    headers: CORS_HEADERS,
  });
};

function httpCodeToErrorCode(status: number): string {
  const map: Record<number, string> = {
    400: "BAD_REQUEST",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    410: "OTP_EXPIRED",
    422: "OTP_INVALID",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
  };
  return map[status] ?? "ERROR";
}
