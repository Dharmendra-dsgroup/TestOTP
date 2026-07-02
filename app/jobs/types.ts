/**
 * BullMQ job data type definitions.
 *
 * All sensitive values (OTP codes) are AES-256-GCM encrypted before being
 * stored in Redis by BullMQ. Workers decrypt them at processing time.
 */

import type { OTP_CHANNEL } from "~/types/otp.types";

// ─── Queue Names ──────────────────────────────────────────────────────────────

export const QUEUES = {
  OTP_DELIVERY: "otp-delivery",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ─── Job Names ────────────────────────────────────────────────────────────────

export const JOB_NAMES = {
  SEND_OTP: "send-otp",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// ─── Job Data Shapes ─────────────────────────────────────────────────────────

/**
 * Data for the "send-otp" job.
 *
 * `otpEncrypted` is the AES-256-GCM ciphertext of the plaintext OTP code.
 * Decrypt with: `decrypt(otpEncrypted, env.ENCRYPTION_KEY)`
 */
export interface SendOtpJobData {
  requestId: string;
  shopDomain: string;
  channel: OTP_CHANNEL;

  /** E.164 phone number (for SMS/WhatsApp/Voice channels). */
  phone?: string;
  /** Email address (for Email channel). */
  email?: string;

  /** AES-256-GCM encrypted OTP code — never store or log the plaintext. */
  otpEncrypted: string;

  /** Rendered SMS template string with {{otp}} placeholder. */
  template: string;
  /** Template variable substitutions (otp will be added by the processor). */
  variables: Record<string, string>;

  /** ISO 8601 expiry timestamp — job should not send after this time. */
  expiresAt: string;

  /** Attempt number (1 = first delivery, 2+ = retried by BullMQ). */
  attempt: number;
}

/**
 * Result written to job.returnvalue after successful processing.
 */
export interface SendOtpJobResult {
  success: boolean;
  messageId?: string;
  provider?: string;
  failoverChain?: string[];
  latencyMs?: number;
  errorMessage?: string;
}
