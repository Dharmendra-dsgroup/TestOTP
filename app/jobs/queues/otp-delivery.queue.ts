/**
 * OTP Delivery BullMQ queue.
 *
 * Uses a lazy-initialized singleton to avoid creating the Queue object during
 * module evaluation (important in Remix SSR where this file may be imported in
 * a non-worker context).
 */

import { Queue } from "bullmq";
import { getRedisClient } from "~/config/redis";
import { QUEUES } from "~/jobs/types";
import type { SendOtpJobData } from "~/jobs/types";

let _queue: Queue<SendOtpJobData> | null = null;

function getQueue(): Queue<SendOtpJobData> {
  if (!_queue) {
    _queue = new Queue<SendOtpJobData>(QUEUES.OTP_DELIVERY, {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return _queue;
}

export const otpDeliveryQueue = {
  /** Enqueues an OTP delivery job. */
  add(data: SendOtpJobData): Promise<unknown> {
    return getQueue().add("send-otp", data, {
      jobId: data.requestId, // Idempotent: same requestId → same job
      delay: 0,
    });
  },

  /** Closes the queue connection gracefully. */
  async close(): Promise<void> {
    await _queue?.close();
    _queue = null;
  },
};
