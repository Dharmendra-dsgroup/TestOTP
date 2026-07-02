import {
  generateOtp as cryptoGenerateOtp,
  hashOtp,
  generateOtpSalt,
  generateSecureToken,
} from "~/utils/crypto";
import type { OTP_LENGTH } from "~/types/otp.types";

export interface GeneratedOtp {
  /** Plaintext code — only kept in memory long enough to send. */
  code: string;
  /** HMAC-SHA256 hash stored in Redis and MongoDB. */
  hash: string;
  /** Per-OTP random salt used for HMAC. */
  salt: string;
  /** Unique 32-char hex token used as Redis key + returned to client. */
  requestId: string;
  /** Absolute expiry timestamp. */
  expiresAt: Date;
}

/**
 * Generates an OTP code, hashes it with a fresh per-OTP salt, and produces a
 * requestId for the Redis key. The plaintext `code` is returned ONCE — it must
 * be encrypted and enqueued for SMS delivery, then discarded.
 */
export function createOtp(length: OTP_LENGTH, expirySeconds: number): GeneratedOtp {
  const code = cryptoGenerateOtp(length);
  const salt = generateOtpSalt();
  const hash = hashOtp(code, salt);
  const requestId = generateSecureToken(16); // 32-char hex
  const expiresAt = new Date(Date.now() + expirySeconds * 1000);

  return { code, hash, salt, requestId, expiresAt };
}
