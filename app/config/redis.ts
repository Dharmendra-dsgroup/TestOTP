import Redis from "ioredis";
import { env } from "./env";

interface RedisCache {
  client: Redis | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __redis: RedisCache | undefined;
}

const cached: RedisCache = global.__redis ?? { client: null };
if (!global.__redis) global.__redis = cached;

export function getRedisClient(): Redis {
  if (cached.client && cached.client.status !== "end") {
    return cached.client;
  }

  const isTls = env.REDIS_URL.startsWith("rediss://");

  // Minimal options — complex retry/timeout options interfere with Upstash TLS
  cached.client = new Redis(env.REDIS_URL, {
    enableReadyCheck: false,
    maxRetriesPerRequest: 1,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
  });

  cached.client.on("ready",        () => console.info("[Redis] Ready"));
  cached.client.on("error", (err)  => console.error("[Redis] Error:", err));
  cached.client.on("end",   ()     => { cached.client = null; });

  return cached.client;
}

export async function disconnectRedis(): Promise<void> {
  if (cached.client) {
    await cached.client.quit();
    cached.client = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  const client = getRedisClient();
  const response = await client.ping();
  if (response !== "PONG") {
    throw new Error(`PING returned: ${JSON.stringify(response)}`);
  }
  return true;
}

export default getRedisClient;
