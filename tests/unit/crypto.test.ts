import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  hashOtp,
  generateOtpSalt,
  generateSecureToken,
  generateOtp,
  timingSafeEqual,
} from "~/utils/crypto";

const TEST_SECRET = "a-32-char-test-secret-for-testing!!";

describe("encrypt / decrypt", () => {
  it("round-trips plaintext correctly", () => {
    const plaintext = "Hello, OTP Login Pro!";
    const ciphertext = encrypt(plaintext, TEST_SECRET);
    expect(decrypt(ciphertext, TEST_SECRET)).toBe(plaintext);
  });

  it("round-trips a JSON credential object", () => {
    const creds = JSON.stringify({ accountSid: "ACxxx", authToken: "tok123" });
    expect(decrypt(encrypt(creds, TEST_SECRET), TEST_SECRET)).toBe(creds);
  });

  it("produces different ciphertext for identical plaintexts (random IV)", () => {
    const p = "same-plaintext";
    const c1 = encrypt(p, TEST_SECRET);
    const c2 = encrypt(p, TEST_SECRET);
    expect(c1).not.toBe(c2);
  });

  it("throws when the ciphertext is tampered with", () => {
    const ciphertext = encrypt("secret", TEST_SECRET);
    const tampered = ciphertext.slice(0, -4) + "0000";
    expect(() => decrypt(tampered, TEST_SECRET)).toThrow();
  });

  it("throws when the wrong key is used", () => {
    const ciphertext = encrypt("secret", TEST_SECRET);
    expect(() => decrypt(ciphertext, "wrong-key-that-is-long-enough-32c")).toThrow();
  });

  it("handles empty string plaintext", () => {
    expect(decrypt(encrypt("", TEST_SECRET), TEST_SECRET)).toBe("");
  });

  it("handles unicode plaintext", () => {
    const unicode = "नमस्ते 🙏 OTP";
    expect(decrypt(encrypt(unicode, TEST_SECRET), TEST_SECRET)).toBe(unicode);
  });
});

describe("hashOtp", () => {
  it("returns a non-empty hex string", () => {
    const hash = hashOtp("123456", "salt123");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  it("same code + same salt → same hash (deterministic)", () => {
    const h1 = hashOtp("654321", "my-salt");
    const h2 = hashOtp("654321", "my-salt");
    expect(h1).toBe(h2);
  });

  it("same code + different salt → different hash", () => {
    const h1 = hashOtp("654321", "salt-a");
    const h2 = hashOtp("654321", "salt-b");
    expect(h1).not.toBe(h2);
  });

  it("different code + same salt → different hash", () => {
    const h1 = hashOtp("111111", "common-salt");
    const h2 = hashOtp("999999", "common-salt");
    expect(h1).not.toBe(h2);
  });
});

describe("generateOtpSalt", () => {
  it("returns a 32-char hex string", () => {
    const salt = generateOtpSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces unique values on each call", () => {
    const salts = new Set(Array.from({ length: 100 }, () => generateOtpSalt()));
    expect(salts.size).toBe(100);
  });
});

describe("generateSecureToken", () => {
  it("defaults to 64-char hex (32 bytes)", () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("respects byteLength parameter", () => {
    expect(generateSecureToken(16)).toHaveLength(32);
    expect(generateSecureToken(8)).toHaveLength(16);
  });

  it("produces unique values", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSecureToken(16)));
    expect(tokens.size).toBe(100);
  });
});

describe("generateOtp", () => {
  it.each([4, 5, 6, 8] as const)(
    "generates a %d-digit numeric string",
    (length) => {
      const otp = generateOtp(length);
      expect(otp).toHaveLength(length);
      expect(/^\d+$/.test(otp)).toBe(true);
    }
  );

  it("stays within numeric range for length 6", () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOtp(6);
      const n = parseInt(otp, 10);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThan(1000000);
    }
  });

  it("pads with leading zeros when needed", () => {
    // Can't force a specific value, but the output length must always be exact
    for (let i = 0; i < 50; i++) {
      expect(generateOtp(4)).toHaveLength(4);
    }
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
