import mongoose from "mongoose";
import { env } from "./env";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mongoose: MongooseCache | undefined;
}

const cached: MongooseCache = global.__mongoose ?? { conn: null, promise: null };

if (!global.__mongoose) {
  global.__mongoose = cached;
}

const CONNECT_OPTIONS: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  connectTimeoutMS: 10_000,
  heartbeatFrequencyMS: 10_000,
  retryWrites: true,
  w: "majority",
};

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.MONGODB_URI, {
        ...CONNECT_OPTIONS,
        dbName: env.MONGODB_DB_NAME,
      })
      .then((instance) => {
        console.info(
          `[MongoDB] Connected — db: ${env.MONGODB_DB_NAME}, host: ${instance.connection.host}`
        );
        return instance;
      })
      .catch((error: unknown) => {
        cached.promise = null;
        console.error("[MongoDB] Connection failed:", error);
        throw error;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cached.conn) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
    console.info("[MongoDB] Disconnected");
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB] Connection dropped — will reconnect on next query");
  cached.conn = null;
  cached.promise = null;
});

mongoose.connection.on("error", (error: unknown) => {
  console.error("[MongoDB] Connection error:", error);
});

export default connectToDatabase;
