/**
 * Health check endpoint — GET /api/health
 *
 * Returns 200 when all critical dependencies are reachable.
 * Returns 503 when any dependency is down.
 *
 * Used by:
 *  - Fly.io / Railway health probes
 *  - Load balancers
 *  - Uptime monitors
 *
 * Response shape:
 * {
 *   status: "ok" | "degraded",
 *   version: string,
 *   uptime: number,        // process uptime in seconds
 *   timestamp: string,     // ISO 8601
 *   checks: {
 *     mongodb: "ok" | "fail",
 *     redis: "ok" | "fail"
 *   }
 * }
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import connectToDatabase from "~/config/database";
import { pingRedis } from "~/config/redis";

type CheckStatus = "ok" | "fail";

interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    mongodb: CheckStatus;
    redis: CheckStatus;
  };
}

export const loader = async (_args: LoaderFunctionArgs) => {
  const checks: Record<string, string> = {
    mongodb: "fail",
    redis: "fail",
  };

  // Check MongoDB
  try {
    await connectToDatabase();
    checks.mongodb = "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.mongodb = `fail: ${msg.slice(0, 200)}`;
  }

  // Check Redis
  try {
    const redisOk = await pingRedis();
    checks.redis = redisOk ? "ok" : "fail: PING returned non-PONG";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.redis = `fail: ${msg.slice(0, 200)}`;
  }

  const allOk = checks.mongodb === "ok" && checks.redis === "ok";
  const status = allOk ? "ok" : "degraded";

  const body = {
    status,
    version: process.env.APP_VERSION ?? "1.0.0",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  };

  return json(body, {
    status: allOk ? 200 : 503,
    headers: {
      // Prevent caching of health check responses
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
};
