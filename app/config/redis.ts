import Redis, { type RedisOptions } from "ioredis";
import { env } from "./env";

interface RedisCache {
  client: Redis | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __redis: RedisCache | undefined;
}

const cached: RedisCache = global.__redis ?? { client: null };

if (!global.__redis) {
  global.__redis = cached;
}

function buildRedisOptions(): RedisOptions {
  const base: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 10_000,
    commandTimeout: 5_000,
    reconnectOnError: (err) => {
      const retriable = ["READONLY", "ECONNREFUSED", "ECONNRESET"];
      return retriable.some((msg) => err.message.includes(msg));
    },
    retryStrategy: (times) => {
      if (times > 10) {
        console.error("[Redis] Max retry attempts exceeded");
        return null;
      }
      const delay = Math.min(times * 200, 5_000);
      console.warn(`[Redis] Retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
  };

  if (env.REDIS_PASSWORD) {
    return { ...base, password: env.REDIS_PASSWORD };
  }

  return base;
}

export function getRedisClient(): Redis {
  if (cached.client && cached.client.status !== "end") {
    return cached.client;
  }

  cached.client = new Redis(env.REDIS_URL, buildRedisOptions());

  cached.client.on("connect", () => {
    console.info("[Redis] Connecting...");
  });

  cached.client.on("ready", () => {
    console.info("[Redis] Ready");
  });

  cached.client.on("error", (error: unknown) => {
    console.error("[Redis] Error:", error);
  });

  cached.client.on("close", () => {
    console.warn("[Redis] Connection closed");
  });

  cached.client.on("reconnecting", () => {
    console.warn("[Redis] Reconnecting...");
  });

  cached.client.on("end", () => {
    console.warn("[Redis] Connection ended");
    cached.client = null;
  });

  return cached.client;
}

export async function disconnectRedis(): Promise<void> {
  if (cached.client) {
    await cached.client.quit();
    cached.client = null;
    console.info("[Redis] Disconnected");
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const response = await client.ping();
    return response === "PONG";
  } catch {
    return false;
  }
}

export default getRedisClient;
