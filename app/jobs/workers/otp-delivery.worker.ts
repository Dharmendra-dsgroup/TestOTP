/**
 * BullMQ Worker — OTP Delivery
 *
 * Runs in the worker process (npm run worker). Processes jobs from the
 * "otp-delivery" queue by calling sendOtpProcessor.
 *
 * Connection note: BullMQ workers require a DEDICATED Redis connection
 * (separate from the queue's connection) to handle blocking operations.
 */

import { Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "~/config/env";
import { QUEUES } from "~/jobs/types";
import { sendOtpProcessor } from "~/jobs/processors/send-otp.processor";
import type { SendOtpJobData, SendOtpJobResult } from "~/jobs/types";

function createWorkerConnection(): IORedis {
  return new IORedis(env.REDIS_URL, {
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });
}

export function createOtpDeliveryWorker(): Worker<SendOtpJobData, SendOtpJobResult> {
  const connection = createWorkerConnection();

  const worker = new Worker<SendOtpJobData, SendOtpJobResult>(
    QUEUES.OTP_DELIVERY,
    sendOtpProcessor,
    {
      connection,
      concurrency: 10, // Process up to 10 OTPs simultaneously
      limiter: {
        max: 100,    // Max 100 jobs per duration window
        duration: 1000, // 1 second
      },
    }
  );

  worker.on("completed", (job, result) => {
    console.info(
      `[OtpWorker] Job ${job.id} completed | provider: ${result.provider} | ` +
      `latency: ${result.latencyMs}ms`
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[OtpWorker] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`
    );
  });

  worker.on("error", (err) => {
    console.error("[OtpWorker] Worker error:", err);
  });

  return worker;
}
