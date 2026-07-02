import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING = "hex" as const;

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns hex-encoded: IV (16 bytes) + AuthTag (16 bytes) + Ciphertext.
 */
export function encrypt(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString(ENCODING);
}

/**
 * Decrypts a hex-encoded ciphertext produced by encrypt().
 */
export function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret);
  const data = Buffer.from(ciphertext, ENCODING);

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * Creates a one-way HMAC-SHA256 hash of an OTP code using a per-OTP salt.
 * Used for storing OTP verifications without keeping the plaintext code.
 */
export function hashOtp(otp: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(otp).digest(ENCODING);
}

/**
 * Generates a cryptographically random salt for OTP hashing.
 */
export function generateOtpSalt(): string {
  return crypto.randomBytes(16).toString(ENCODING);
}

/**
 * Generates a cryptographically secure random token.
 */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString(ENCODING);
}

/**
 * Timing-safe string comparison to prevent timing attacks during OTP verification.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, ENCODING);
  const bufB = Buffer.from(b, ENCODING);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a numeric OTP of the specified length.
 */
export function generateOtp(length: 4 | 5 | 6 | 8): string {
  const max = Math.pow(10, length);
  const min = Math.pow(10, length - 1);
  const range = max - min;

  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0);
  const otp = min + (randomValue % range);

  return String(otp).padStart(length, "0");
}
