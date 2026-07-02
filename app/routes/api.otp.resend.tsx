/**
 * Public API — Resend OTP
 *
 * POST /api/otp/resend
 *
 * Invalidates the previous OTP, generates a new one, re-queues delivery.
 * Enforces the resend cooldown set in shop settings.
 *
 * Request body (JSON or form-encoded):
 *   shop      — Shopify store domain
 *   requestId — 32-char token from the original /api/otp/generate call
 *
 * Response 200:
 *   { requestId, expiresAt, resendDelay, maskedDestination }
 *
 * Response 4xx/5xx:
 *   { error: string, code: string }
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { otpService } from "~/services/otp.service";
import { otpResendSchema } from "~/validators/otp.validator";
import {
  validateProxySignature,
  extractShopFromProxy,
  isProxySignatureRequired,
} from "~/lib/shopify/proxy-auth.server";

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
      status: 405, headers: CORS_HEADERS,
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
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      raw = await request.json();
    } else {
      const fd = await request.formData();
      raw = Object.fromEntries(fd.entries());
    }
  } catch {
    return json({ error: "Invalid request body", code: "INVALID_BODY" }, {
      status: 400, headers: CORS_HEADERS,
    });
  }

  // Use shop from proxy query param if present (app proxy injects it)
  const proxyShop = extractShopFromProxy(request);
  if (proxyShop && !raw.shop) raw = { ...raw, shop: proxyShop };

  const parsed = otpResendSchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      { error: parsed.error.errors[0]?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { shop, requestId } = parsed.data;
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const result = await otpService.resend({ shopDomain: shop, requestId, ipAddress });

  if (!result.success) {
    const status = result.statusCode ?? 500;
    return json({ error: result.error, code: codeFromStatus(status) }, {
      status, headers: CORS_HEADERS,
    });
  }

  return json(result.data, { status: 200, headers: CORS_HEADERS });
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, {
    status: 405, headers: CORS_HEADERS,
  });
};

function codeFromStatus(s: number): string {
  const m: Record<number, string> = {
    400: "BAD_REQUEST", 403: "FORBIDDEN", 404: "NOT_FOUND",
    410: "OTP_EXPIRED", 422: "OTP_INVALID", 429: "RATE_LIMITED", 500: "INTERNAL_ERROR",
  };
  return m[s] ?? "ERROR";
}
