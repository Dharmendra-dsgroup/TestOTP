import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  isValidE164,
  maskPhone,
  maskEmail,
  countryFromPhone,
} from "~/utils/phone";

describe("normalizePhone", () => {
  it("accepts a clean E.164 number", () => {
    expect(normalizePhone("+15551234567")).toBe("+15551234567");
  });

  it("strips spaces, dashes, and parentheses", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
  });

  it("strips dots", () => {
    expect(normalizePhone("+44.20.7946.0958")).toBe("+442079460958");
  });

  it("handles Indian mobile number", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
  });

  it("returns null for a number without + prefix", () => {
    expect(normalizePhone("5551234567")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("returns null for too-short E.164", () => {
    expect(normalizePhone("+123")).toBeNull();
  });

  it("returns null for too-long E.164 (>15 digits)", () => {
    expect(normalizePhone("+123456789012345678")).toBeNull();
  });

  it("returns null for letters mixed in", () => {
    expect(normalizePhone("+1abc5551234")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("accepts valid E.164", () => {
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("+919876543210")).toBe(true);
    expect(isValidE164("+44207946123")).toBe(true);
  });

  it("rejects numbers without +", () => {
    expect(isValidE164("15551234567")).toBe(false);
  });

  it("rejects too-short numbers", () => {
    expect(isValidE164("+1234")).toBe(false);
  });
});

describe("maskPhone", () => {
  it("masks a US number correctly", () => {
    const masked = maskPhone("+15551234567");
    expect(masked).toBe("+1****4567");
  });

  it("masks an Indian number correctly", () => {
    const masked = maskPhone("+919876543210");
    expect(masked).toBe("+91****3210");
  });

  it("masks a UAE number (+971)", () => {
    const masked = maskPhone("+971501234567");
    expect(masked).toBe("+971****4567");
  });

  it("returns ****  for a string not starting with +", () => {
    expect(maskPhone("15551234567")).toBe("****");
  });

  it("masks a very short number gracefully", () => {
    const masked = maskPhone("+1234");
    expect(masked).toContain("****");
  });

  it("always hides the middle digits", () => {
    const masked = maskPhone("+15551234567");
    expect(masked).not.toContain("555123");
  });
});

describe("maskEmail", () => {
  it("masks a normal email", () => {
    expect(maskEmail("user@example.com")).toBe("us**@example.com");
  });

  it("masks a short local part (2 chars)", () => {
    expect(maskEmail("ab@example.com")).toBe("a*@example.com");
  });

  it("masks a single-char local part", () => {
    expect(maskEmail("a@example.com")).toBe("a*@example.com");
  });

  it("masks a longer local part", () => {
    const masked = maskEmail("dharmendra@example.com");
    expect(masked.startsWith("dh")).toBe(true);
    expect(masked).toContain("@example.com");
    expect(masked).not.toContain("armendra");
  });

  it("returns **** for an invalid email (no @)", () => {
    expect(maskEmail("notanemail")).toBe("****");
  });
});

describe("countryFromPhone", () => {
  it("detects US (+1)", () => {
    expect(countryFromPhone("+15551234567")).toBe("US");
  });

  it("detects India (+91)", () => {
    expect(countryFromPhone("+919876543210")).toBe("IN");
  });

  it("detects UAE (+971)", () => {
    expect(countryFromPhone("+971501234567")).toBe("AE");
  });

  it("detects UK (+44)", () => {
    expect(countryFromPhone("+442079460958")).toBe("GB");
  });

  it("detects Germany (+49)", () => {
    expect(countryFromPhone("+4930123456")).toBe("DE");
  });

  it("prefers longer prefix over shorter (e.g. +971 over +9)", () => {
    expect(countryFromPhone("+971501234567")).toBe("AE");
  });

  it("returns null for an unknown prefix", () => {
    expect(countryFromPhone("+9991234567")).toBeNull();
  });
});
