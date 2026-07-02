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
  const checks: HealthResponse["checks"] = {
    mongodb: "fail",
    redis: "fail",
  };

  // Check MongoDB
  try {
    await connectToDatabase();
    checks.mongodb = "ok";
  } catch {
    checks.mongodb = "fail";
  }

  // Check Redis
  try {
    const redisOk = await pingRedis();
    checks.redis = redisOk ? "ok" : "fail";
  } catch {
    checks.redis = "fail";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  const status = allOk ? "ok" : "degraded";

  const body: HealthResponse = {
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
