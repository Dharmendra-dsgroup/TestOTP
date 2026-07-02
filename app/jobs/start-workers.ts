/**
 * Worker process entry point.
 *
 * Run with:   npm run worker
 * Production: npx tsx app/jobs/start-workers.ts
 *
 * This file is intentionally separate from the Remix server so workers can be
 * deployed as a separate dyno/service on Render without consuming web capacity.
 */

import { createOtpDeliveryWorker } from "./workers/otp-delivery.worker";

console.log("[Workers] Starting OTP delivery worker...");

const otpWorker = createOtpDeliveryWorker();

async function shutdown(signal: string): Promise<void> {
  console.log(`[Workers] Received ${signal}. Draining and shutting down...`);

  try {
    await otpWorker.close();
    console.log("[Workers] OTP delivery worker closed.");
  } catch (err) {
    console.error("[Workers] Error during shutdown:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Keep the process alive
process.on("uncaughtException", (err) => {
  console.error("[Workers] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Workers] Unhandled rejection:", reason);
});
