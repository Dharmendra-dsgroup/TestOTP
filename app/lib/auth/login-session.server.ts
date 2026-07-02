/**
 * Short-lived post-OTP-verification login session.
 *
 * After a customer verifies their OTP, the verify API returns a `sessionToken`.
 * The storefront widget immediately redirects the browser to:
 *   /api/auth/login?token={sessionToken}&shop={shop}
 *
 * That route calls consumeLoginSession() to retrieve the verified identity,
 * then performs the Shopify customer login redirect (activation URL or Multipass).
 *
 * The session is:
 * - One-time: consumed atomically via GETDEL (cannot be reused)
 * - Short-lived: 60-second TTL (reduced attack window)
 * - Tied to shop domain (prevents cross-shop token reuse)
 */

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
}

/**
 * Creates a login session in Redis.
 * Returns a 32-char hex token to be sent to the client.
 */
export async function createLoginSession(data: LoginSessionData): Promise<string> {
  const token = generateSecureToken(16); // 32-char hex
  const key = `${KEY_PREFIX}${token}`;
  await getRedisClient().set(key, JSON.stringify(data), "EX", SESSION_TTL_SECONDS);
  return token;
}

/**
 * Atomically retrieves and deletes a login session.
 * Returns null if the token is expired or already consumed.
 *
 * IMPORTANT: validates that sessionData.shopDomain matches the provided shop
 * to prevent cross-shop token reuse.
 */
export async function consumeLoginSession(
  token: string,
  shopDomain: string
): Promise<LoginSessionData | null> {
  const redis = getRedisClient();
  const key = `${KEY_PREFIX}${token}`;

  // GETDEL is atomic — one-time use
  const raw = await redis.getdel(key);
  if (!raw) return null;

  try {
    const data = JSON.parse(raw) as LoginSessionData;
    // Validate shop domain matches to prevent cross-shop replay
    if (data.shopDomain.toLowerCase() !== shopDomain.toLowerCase()) return null;
    return data;
  } catch {
    return null;
  }
}
