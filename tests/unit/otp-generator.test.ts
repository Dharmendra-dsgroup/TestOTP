import { describe, it, expect } from "vitest";
import { createOtp } from "~/lib/otp/otp-generator";
import { hashOtp } from "~/utils/crypto";

describe("createOtp", () => {
  it("returns an object with all required fields", () => {
    const otp = createOtp(6, 120);
    expect(otp).toHaveProperty("code");
    expect(otp).toHaveProperty("hash");
    expect(otp).toHaveProperty("salt");
    expect(otp).toHaveProperty("requestId");
    expect(otp).toHaveProperty("expiresAt");
  });

  it.each([4, 5, 6, 8] as const)(
    "code has exactly %d digits",
    (length) => {
      const { code } = createOtp(length, 120);
      expect(code).toHaveLength(length);
      expect(/^\d+$/.test(code)).toBe(true);
    }
  );

  it("hash is NOT the plaintext code", () => {
    const { code, hash } = createOtp(6, 120);
    expect(hash).not.toBe(code);
  });

  it("hash matches re-computing hashOtp(code, salt)", () => {
    const { code, hash, salt } = createOtp(6, 120);
    expect(hash).toBe(hashOtp(code, salt));
  });

  it("requestId is a 32-char hex string", () => {
    const { requestId } = createOtp(6, 120);
    expect(requestId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("expiresAt is approximately expirySeconds in the future", () => {
    const before = Date.now();
    const { expiresAt } = createOtp(6, 120);
    const after = Date.now();
    const expMs = expiresAt.getTime();
    expect(expMs).toBeGreaterThanOrEqual(before + 120_000);
    expect(expMs).toBeLessThanOrEqual(after + 120_000 + 100);
  });

  it("each call produces a unique requestId", () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => createOtp(6, 120).requestId)
    );
    expect(ids.size).toBe(200);
  });

  it("each call produces a unique salt", () => {
    const salts = new Set(
      Array.from({ length: 200 }, () => createOtp(6, 120).salt)
    );
    expect(salts.size).toBe(200);
  });

  it("expiresAt uses the supplied expiry seconds", () => {
    const short = createOtp(6, 30);
    const long = createOtp(6, 600);
    expect(long.expiresAt.getTime()).toBeGreaterThan(
      short.expiresAt.getTime() + 500_000
    );
  });

  it("two calls to createOtp(6, 120) produce different codes on average", () => {
    // With 10^6 possible codes and 100 samples, collision probability is negligible
    const codes = new Set(
      Array.from({ length: 100 }, () => createOtp(6, 120).code)
    );
    expect(codes.size).toBeGreaterThan(90);
  });
});
