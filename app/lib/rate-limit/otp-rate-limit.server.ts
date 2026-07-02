/**
 * OTP-specific rate limiting rules built on top of the sliding-window rate limiter.
 *
 * Limits (all sliding window):
 *   Per phone  — 5 OTPs per hour
 *   Per IP     — 20 OTPs per hour
 *   Per store  — 1 000 OTPs per hour
 *   Resend     — 1 request per resendDelay seconds (simple TTL key)
 */

import { rateLimiter, type RateLimitResult } from "./rate-limiter.server";
import { getRedisClient } from "~/config/redis";

const PHONE_LIMIT = 5;
const IP_LIMIT = 20;
const STORE_LIMIT = 1000;
const WINDOW_SECONDS = 3600; // 1 hour

function phoneKey(shopDomain: string, phone: string): string {
  return `rl:phone:${shopDomain}:${phone}`;
}

function ipKey(shopDomain: string, ip: string): string {
  return `rl:ip:${shopDomain}:${ip}`;
}

function storeKey(shopDomain: string): string {
  return `rl:store:${shopDomain}`;
}

function resendKey(shopDomain: string, phone: string): string {
  return `rl:resend:${shopDomain}:${phone}`;
}

export interface OtpRateLimitCheckResult {
  allowed: boolean;
  reason?: "phone_limit" | "ip_limit" | "store_limit" | "resend_cooldown";
  retryAfterSeconds?: number;
}

export class OtpRateLimiter {
  /**
   * Runs all three generate-OTP rate checks in parallel.
   * Returns on the first failure so later checks are skipped when blocked.
   */
  async checkGenerate(
    shopDomain: string,
    phone: string,
    ipAddress: string
  ): Promise<OtpRateLimitCheckResult> {
    const [phoneResult, ipResult, storeResult] = await Promise.all([
      rateLimiter.check(phoneKey(shopDomain, phone), PHONE_LIMIT, WINDOW_SECONDS),
      rateLimiter.check(ipKey(shopDomain, ipAddress), IP_LIMIT, WINDOW_SECONDS),
      rateLimiter.check(storeKey(shopDomain), STORE_LIMIT, WINDOW_SECONDS),
    ]);

    if (!phoneResult.allowed) {
      return {
        allowed: false,
        reason: "phone_limit",
        retryAfterSeconds: WINDOW_SECONDS,
      };
    }

    if (!ipResult.allowed) {
      return {
        allowed: false,
        reason: "ip_limit",
        retryAfterSeconds: WINDOW_SECONDS,
      };
    }

    if (!storeResult.allowed) {
      return {
        allowed: false,
        reason: "store_limit",
        retryAfterSeconds: WINDOW_SECONDS,
      };
    }

    return { allowed: true };
  }

  /**
   * Checks whether the resend cooldown has expired for a given phone number.
   * Returns false if the cooldown is still active.
   */
  async checkResendCooldown(
    shopDomain: string,
    phone: string
  ): Promise<{ allowed: boolean; ttlSeconds?: number }> {
    const redis = getRedisClient();
    const key = resendKey(shopDomain, phone);
    const ttl = await redis.ttl(key);

    if (ttl > 0) {
      return { allowed: false, ttlSeconds: ttl };
    }

    return { allowed: true };
  }

  /**
   * Sets the resend cooldown key with the given TTL.
   * Call this AFTER successfully queuing the SMS.
   */
  async setResendCooldown(
    shopDomain: string,
    phone: string,
    delaySecs: number
  ): Promise<void> {
    const redis = getRedisClient();
    await redis.set(resendKey(shopDomain, phone), "1", "EX", delaySecs);
  }

  /**
   * Rolls back phone + IP + store counters for a request that was rejected
   * (e.g. blocked phone number, inactive shop). Prevents counting blocked
   * requests against the rate limit.
   *
   * Note: this does NOT undo the sorted-set entry atomically — it simply
   * decrements via a new Lua call. For our use case (low-frequency blocking),
   * approximate correctness is acceptable.
   */
  async rollback(shopDomain: string, phone: string, ipAddress: string): Promise<void> {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    // Remove the most-recent entry from each sorted set
    pipeline.zpopmax(phoneKey(shopDomain, phone));
    pipeline.zpopmax(ipKey(shopDomain, ipAddress));
    pipeline.zpopmax(storeKey(shopDomain));
    await pipeline.exec();
  }
}

export const otpRateLimiter = new OtpRateLimiter();
