/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 *
 * Each request occupies one entry in a sorted set keyed by the caller-provided key.
 * The entry's score is the Unix timestamp in milliseconds. Entries older than the
 * window are evicted atomically via a Lua script before counting, ensuring the count
 * is always an exact sliding-window count with no race conditions.
 */

import { getRedisClient } from "~/config/redis";

// Lua script: atomic remove-old + count + maybe-insert in one round-trip
const SLIDING_WINDOW_SCRIPT = `
local key       = KEYS[1]
local now       = tonumber(ARGV[1])
local win_start = tonumber(ARGV[2])
local limit     = tonumber(ARGV[3])
local win_ttl   = tonumber(ARGV[4])
local nonce     = ARGV[5]

-- Remove entries outside the current window
redis.call('ZREMRANGEBYSCORE', key, 0, win_start)

local count = tonumber(redis.call('ZCARD', key))

if count >= limit then
  -- Return: {allowed=0, current_count, remaining=0}
  return {0, count, 0}
end

-- Insert current request
redis.call('ZADD', key, now, nonce)
redis.call('EXPIRE', key, win_ttl)

return {1, count + 1, limit - count - 1}
`;

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  /** Key that was checked — useful for debugging and logging. */
  key: string;
}

export class RateLimiter {
  /**
   * Checks whether a request identified by `key` is within the allowed `limit`
   * for the rolling `windowSeconds` window.
   *
   * @param key         Full Redis key for this rate-limit bucket.
   * @param limit       Maximum number of requests in the window.
   * @param windowSeconds Rolling window size in seconds.
   * @returns RateLimitResult — caller must check `.allowed` before proceeding.
   */
  async check(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const redis = getRedisClient();
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const nonce = `${now}-${Math.random().toString(36).slice(2, 9)}`;

    const result = (await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      String(now),
      String(windowStart),
      String(limit),
      String(windowSeconds),
      nonce
    )) as [number, number, number];

    return {
      allowed: result[0] === 1,
      count: result[1],
      remaining: result[2],
      key,
    };
  }

  /**
   * Resets the rate-limit counter for the given key.
   * Use after a successful verification to allow the next OTP immediately.
   */
  async reset(key: string): Promise<void> {
    await getRedisClient().del(key);
  }
}

export const rateLimiter = new RateLimiter();
