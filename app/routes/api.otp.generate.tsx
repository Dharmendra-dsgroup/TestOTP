/**
 * Public API — Generate OTP
 *
 * POST /api/otp/generate
 *
 * Called by the Shopify theme extension (via Shopify App Proxy in Phase 4).
 * In Phase 3, accepts requests with `shop` body parameter.
 *
 * Request body (JSON or form-encoded):
 *   shop     — Shopify store domain (e.g. "mystore.myshopify.com")
 *   channel  — "sms" | "email" | "whatsapp" | "voice"
 *   phone    — E.164 or international format (required for sms/whatsapp/voice)
 *   email    — email address (required for email channel)
 *
 * Response 200:
 *   { requestId, expiresAt, resendDelay, maskedDestination, channel }
 *
 * Response 4xx:
 *   { error: string, code: string }
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { otpService } from "~/services/otp.service";
import { otpGenerateSchema } from "~/validators/otp.validator";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  // Parse request body (JSON or form-encoded)
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

  // Validate input
  const parsed = otpGenerateSchema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return json(
      { error: firstError?.message ?? "Validation failed", code: "VALIDATION_ERROR" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { shop, channel, phone, email, countryCode } = parsed.data;

  // Extract real IP address
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const userAgent = request.headers.get("user-agent") ?? "";

  const result = await otpService.generateAndSend({
    shopDomain: shop,
    channel,
    phone,
    email,
    ipAddress,
    userAgent,
    countryCode,
  });

  if (!result.success) {
    const status = result.statusCode ?? 500;
    return json(
      { error: result.error, code: httpCodeToErrorCode(status) },
      { status, headers: CORS_HEADERS }
    );
  }

  return json(result.data, { status: 200, headers: CORS_HEADERS });
};

// CORS preflight for loader (GET) — not used but Remix requires export
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
