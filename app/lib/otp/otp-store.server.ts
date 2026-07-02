/**
 * Redis-based OTP storage.
 *
 * Schema (Redis Hash, key = "otp:{shopDomain}:{requestId}"):
 *   hash       — HMAC-SHA256 of the OTP code
 *   salt       — per-OTP salt used to compute the hash
 *   attempts   — current verification attempt count
 *   maxAttempts — maximum attempts allowed before blocking
 *   expiresAt  — Unix timestamp (ms) when the OTP expires
 *   phone      — E.164 phone number (optional)
 *   email      — email address (optional)
 *   channel    — "sms" | "email" | "whatsapp" | "voice"
 *
 * TTL is set on the Redis key itself (in seconds) to ensure automatic cleanup.
 */

import { getRedisClient } from "~/config/redis";
import type { OTP_CHANNEL } from "~/types/otp.types";

const KEY_PREFIX = "otp:";

export interface OtpStoreEntry {
  hash: string;
  salt: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: number; // Unix ms
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
}

function buildKey(shopDomain: string, requestId: string): string {
  return `${KEY_PREFIX}${shopDomain}:${requestId}`;
}

function parseEntry(raw: Record<string, string>): OtpStoreEntry {
  return {
    hash: raw.hash,
    salt: raw.salt,
    attempts: parseInt(raw.attempts ?? "0", 10),
    maxAttempts: parseInt(raw.maxAttempts ?? "5", 10),
    expiresAt: parseInt(raw.expiresAt ?? "0", 10),
    phone: raw.phone || undefined,
    email: raw.email || undefined,
    channel: (raw.channel as OTP_CHANNEL) ?? "sms",
  };
}

export class OtpStore {
  async store(
    shopDomain: string,
    requestId: string,
    entry: Omit<OtpStoreEntry, "attempts">,
    ttlSeconds: number
  ): Promise<void> {
    const redis = getRedisClient();
    const key = buildKey(shopDomain, requestId);

    const fields: Record<string, string> = {
      hash: entry.hash,
      salt: entry.salt,
      maxAttempts: String(entry.maxAttempts),
      expiresAt: String(entry.expiresAt),
      attempts: "0",
      channel: entry.channel,
    };

    if (entry.phone) fields.phone = entry.phone;
    if (entry.email) fields.email = entry.email;

    await redis.hset(key, fields);
    await redis.expire(key, ttlSeconds);
  }

  async get(shopDomain: string, requestId: string): Promise<OtpStoreEntry | null> {
    const redis = getRedisClient();
    const key = buildKey(shopDomain, requestId);
    const raw = await redis.hgetall(key);

    if (!raw || !raw.hash) return null;

    return parseEntry(raw);
  }

  /**
   * Atomically increments attempts and returns the new count.
   */
  async incrementAttempts(shopDomain: string, requestId: string): Promise<number> {
    const redis = getRedisClient();
    const key = buildKey(shopDomain, requestId);
    return redis.hincrby(key, "attempts", 1);
  }

  async delete(shopDomain: string, requestId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(buildKey(shopDomain, requestId));
  }

  async exists(shopDomain: string, requestId: string): Promise<boolean> {
    const redis = getRedisClient();
    return (await redis.exists(buildKey(shopDomain, requestId))) === 1;
  }
}

export const otpStore = new OtpStore();
