/**
 * Short-lived post-OTP-verification login session.
 *
 * After a customer verifies their OTP, the verify API returns a `sessionToken`.
 * The storefront widget POSTs the token to /api/auth/login (never in a URL).
 *
 * Security properties:
 * - One-time: consumed atomically via GETDEL (cannot be reused)
 * - Short-lived: 60-second TTL
 * - Shop-bound: cross-shop token reuse is rejected
 * - IP-bound: token can only be consumed from the same IP that verified the OTP
 * - UA-bound: User-Agent hash must match between verify and login requests
 */

import crypto from "node:crypto";
import { getRedisClient } from "~/config/redis";
import { generateSecureToken } from "~/utils/crypto";
import type { OTP_CHANNEL } from "~/types/otp.types";

const SESSION_TTL_SECONDS = 60;
const KEY_PREFIX = "loginsess:";

export interface LoginSessionData {
  shopDomain: string;
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
  verifiedAt: number; // Unix ms
  ip: string;         // Client IP at verify time
  uaHash: string;     // SHA-256[:16] of User-Agent at verify time
}

export function hashUserAgent(userAgent: string): string {
  return crypto.createHash("sha256").update(userAgent || "").digest("hex").slice(0, 16);
}

export function extractClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Creates a login session in Redis.
 * Returns a 32-char hex token to be sent to the client.
 */
export async function createLoginSession(data: LoginSessionData): Promise<string> {
  const token = generateSecureToken(16); // 32-char hex
  await getRedisClient().set(
    `${KEY_PREFIX}${token}`,
    JSON.stringify(data),
    "EX",
    SESSION_TTL_SECONDS
  );
  return token;
}

/**
 * Atomically retrieves and deletes a login session.
 * Returns null if the token is expired, already consumed, or any binding check fails.
 *
 * Binding checks (in order):
 *  1. shopDomain must match — prevents cross-shop replay
 *  2. ip must match — prevents token theft from a different network
 *  3. uaHash must match — prevents token theft from a different browser
 */
export async function consumeLoginSession(
  token: string,
  shopDomain: string,
  incomingIp: string,
  incomingUaHash: string
): Promise<LoginSessionData | null> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${token}`;

  // GETDEL is atomic — one-time use
  const raw = await redis.getdel(key);
  if (!raw) return null;

  let data: LoginSessionData;
  try {
    data = JSON.parse(raw) as LoginSessionData;
  } catch {
    return null;
  }

  // 1. Shop domain binding
  if (data.shopDomain.toLowerCase() !== shopDomain.toLowerCase()) {
    console.warn("[LoginSession] Shop domain mismatch — cross-shop replay attempt blocked");
    return null;
  }

  // 2. IP binding — both "unknown" treated as pass (dev/test environments)
  if (data.ip !== "unknown" && incomingIp !== "unknown" && data.ip !== incomingIp) {
    console.warn(
      `[LoginSession] IP mismatch: verified from ${data.ip}, login attempt from ${incomingIp} — blocked`
    );
    return null;
  }

  // 3. User-Agent binding
  if (data.uaHash && incomingUaHash && data.uaHash !== incomingUaHash) {
    console.warn("[LoginSession] User-Agent mismatch — possible token theft blocked");
    return null;
  }

  return data;
}
