import { describe, it, expect } from "vitest";
import {
  getPlan,
  isOverLimit,
  isNearLimit,
  usagePercent,
  PLAN_KEYS,
  PLAN_LIST,
  PLANS,
} from "~/config/plans";

describe("getPlan", () => {
  it("returns the correct plan for each key", () => {
    expect(getPlan("free").key).toBe("free");
    expect(getPlan("starter").key).toBe("starter");
    expect(getPlan("growth").key).toBe("growth");
    expect(getPlan("enterprise").key).toBe("enterprise");
  });

  it("returns the free plan for an unknown key", () => {
    expect(getPlan("unknown_plan").key).toBe("free");
  });

  it("returns the free plan for an empty string", () => {
    expect(getPlan("").key).toBe("free");
  });
});

describe("plan definitions — structural sanity", () => {
  it("all plans have required fields", () => {
    for (const key of PLAN_KEYS) {
      const p = PLANS[key];
      expect(p.key).toBe(key);
      expect(typeof p.name).toBe("string");
      expect(typeof p.price).toBe("number");
      expect(p.price).toBeGreaterThanOrEqual(0);
      expect(typeof p.monthlyOtpLimit).toBe("number");
      expect(typeof p.warnAtPercent).toBe("number");
      expect(Array.isArray(p.highlights)).toBe(true);
    }
  });

  it("free plan is $0 with no trial", () => {
    const free = PLANS.free;
    expect(free.price).toBe(0);
    expect(free.trialDays).toBe(0);
  });

  it("enterprise has unlimited OTPs", () => {
    expect(PLANS.enterprise.monthlyOtpLimit).toBe(-1);
  });

  it("enterprise has unlimited providers", () => {
    expect(PLANS.enterprise.maxProviders).toBe(-1);
  });

  it("enterprise has multipass enabled", () => {
    expect(PLANS.enterprise.multipassEnabled).toBe(true);
  });

  it("growth and enterprise have fraud detection", () => {
    expect(PLANS.growth.fraudDetectionEnabled).toBe(true);
    expect(PLANS.enterprise.fraudDetectionEnabled).toBe(true);
  });

  it("free and starter do NOT have fraud detection", () => {
    expect(PLANS.free.fraudDetectionEnabled).toBe(false);
    expect(PLANS.starter.fraudDetectionEnabled).toBe(false);
  });

  it("analytics is only on growth and enterprise", () => {
    expect(PLANS.free.analyticsEnabled).toBe(false);
    expect(PLANS.starter.analyticsEnabled).toBe(false);
    expect(PLANS.growth.analyticsEnabled).toBe(true);
    expect(PLANS.enterprise.analyticsEnabled).toBe(true);
  });

  it("plans are in ascending price order in PLAN_LIST", () => {
    for (let i = 1; i < PLAN_LIST.length; i++) {
      expect(PLAN_LIST[i].price).toBeGreaterThanOrEqual(PLAN_LIST[i - 1].price);
    }
  });

  it("warnAtPercent is between 1 and 100 for limited plans", () => {
    for (const key of PLAN_KEYS) {
      const p = PLANS[key];
      if (p.monthlyOtpLimit !== -1) {
        expect(p.warnAtPercent).toBeGreaterThan(0);
        expect(p.warnAtPercent).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("isOverLimit", () => {
  it("returns false when count is below limit", () => {
    expect(isOverLimit(PLANS.free, 50)).toBe(false);
    expect(isOverLimit(PLANS.free, 99)).toBe(false);
  });

  it("returns true when count equals limit", () => {
    expect(isOverLimit(PLANS.free, 100)).toBe(true);
  });

  it("returns true when count exceeds limit", () => {
    expect(isOverLimit(PLANS.free, 150)).toBe(true);
    expect(isOverLimit(PLANS.starter, 1001)).toBe(true);
  });

  it("always returns false for unlimited plan (enterprise)", () => {
    expect(isOverLimit(PLANS.enterprise, 0)).toBe(false);
    expect(isOverLimit(PLANS.enterprise, 9_999_999)).toBe(false);
  });
});

describe("isNearLimit", () => {
  it("returns true at the warn threshold for free plan (80% of 100 = 80)", () => {
    expect(isNearLimit(PLANS.free, 80)).toBe(true);
  });

  it("returns true above the warn threshold", () => {
    expect(isNearLimit(PLANS.free, 95)).toBe(true);
    expect(isNearLimit(PLANS.free, 100)).toBe(true);
  });

  it("returns false below the warn threshold", () => {
    expect(isNearLimit(PLANS.free, 79)).toBe(false);
    expect(isNearLimit(PLANS.free, 0)).toBe(false);
  });

  it("returns false for unlimited plan", () => {
    expect(isNearLimit(PLANS.enterprise, 9_999_999)).toBe(false);
  });

  it("growth plan warns at 85% of 10 000 = 8 500", () => {
    expect(isNearLimit(PLANS.growth, 8500)).toBe(true);
    expect(isNearLimit(PLANS.growth, 8499)).toBe(false);
  });
});

describe("usagePercent", () => {
  it("returns 0 for zero usage", () => {
    expect(usagePercent(PLANS.free, 0)).toBe(0);
  });

  it("returns 50 at half usage", () => {
    expect(usagePercent(PLANS.free, 50)).toBe(50);
  });

  it("returns 100 at full usage", () => {
    expect(usagePercent(PLANS.free, 100)).toBe(100);
  });

  it("can exceed 100 when over-limit", () => {
    expect(usagePercent(PLANS.free, 150)).toBe(150);
  });

  it("returns 0 for unlimited plans", () => {
    expect(usagePercent(PLANS.enterprise, 9_999_999)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    // 33 / 100 = 33%
    expect(usagePercent(PLANS.free, 33)).toBe(33);
    // 1 / 1000 = 0.1% → rounds to 0
    expect(usagePercent(PLANS.starter, 1)).toBe(0);
    // 5 / 1000 = 0.5% → rounds to 1
    expect(usagePercent(PLANS.starter, 5)).toBe(1);
  });
});
