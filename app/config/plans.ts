/**
 * OTP Login Pro — Plan Definitions
 *
 * Single source of truth for all plan features, limits, and pricing.
 * This file is imported by both the BillingService (server) and the
 * billing UI (client) — keep it free of server-only imports.
 */

export const PLAN_KEYS = ["free", "starter", "growth", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanDefinition {
  readonly key: PlanKey;
  readonly name: string;
  /** USD per 30-day period. 0 = always free (no Shopify subscription created). */
  readonly price: number;
  /** Shopify-enforced trial before first charge. 0 = no trial. */
  readonly trialDays: number;
  /** Monthly OTP sends. -1 = unlimited. */
  readonly monthlyOtpLimit: number;
  /** Soft-warn at this percentage of monthlyOtpLimit (0–100). */
  readonly warnAtPercent: number;
  readonly emailOtpEnabled: boolean;
  readonly analyticsEnabled: boolean;
  /** Max SMS providers that can be configured. -1 = unlimited. */
  readonly maxProviders: number;
  readonly multipassEnabled: boolean;
  readonly fraudDetectionEnabled: boolean;
  readonly prioritySupport: boolean;
  /** Human-readable highlights shown on the billing page. */
  readonly highlights: readonly string[];
}

export const PLANS: Readonly<Record<PlanKey, PlanDefinition>> = {
  free: {
    key: "free",
    name: "Free",
    price: 0,
    trialDays: 0,
    monthlyOtpLimit: 100,
    warnAtPercent: 80,
    emailOtpEnabled: false,
    analyticsEnabled: false,
    maxProviders: 1,
    multipassEnabled: false,
    fraudDetectionEnabled: false,
    prioritySupport: false,
    highlights: [
      "100 OTPs / month",
      "SMS login only",
      "1 SMS provider",
      "Community support",
    ],
  },

  starter: {
    key: "starter",
    name: "Starter",
    price: 9.99,
    trialDays: 7,
    monthlyOtpLimit: 1000,
    warnAtPercent: 80,
    emailOtpEnabled: true,
    analyticsEnabled: false,
    maxProviders: 2,
    multipassEnabled: false,
    fraudDetectionEnabled: false,
    prioritySupport: false,
    highlights: [
      "1,000 OTPs / month",
      "SMS + Email login",
      "2 SMS providers",
      "7-day free trial",
      "Email support",
    ],
  },

  growth: {
    key: "growth",
    name: "Growth",
    price: 29.99,
    trialDays: 7,
    monthlyOtpLimit: 10000,
    warnAtPercent: 85,
    emailOtpEnabled: true,
    analyticsEnabled: true,
    maxProviders: 5,
    multipassEnabled: false,
    fraudDetectionEnabled: true,
    prioritySupport: false,
    highlights: [
      "10,000 OTPs / month",
      "SMS + Email login",
      "Up to 5 SMS providers with failover",
      "Analytics dashboard",
      "Fraud & bot detection",
      "7-day free trial",
      "Priority email support",
    ],
  },

  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    price: 99.99,
    trialDays: 14,
    monthlyOtpLimit: -1,
    warnAtPercent: 90,
    emailOtpEnabled: true,
    analyticsEnabled: true,
    maxProviders: -1,
    multipassEnabled: true,
    fraudDetectionEnabled: true,
    prioritySupport: true,
    highlights: [
      "Unlimited OTPs",
      "SMS + Email login",
      "Unlimited SMS providers",
      "Shopify Plus Multipass support",
      "Advanced analytics",
      "Fraud & bot detection",
      "14-day free trial",
      "Dedicated support",
    ],
  },
} as const;

/** Ordered array for rendering upgrade options (cheapest → most expensive). */
export const PLAN_LIST: readonly PlanDefinition[] = PLAN_KEYS.map(
  (k) => PLANS[k]
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getPlan(key: string): PlanDefinition {
  return PLANS[(key as PlanKey) in PLANS ? (key as PlanKey) : "free"];
}

/** Returns true if the given OTP count has hit or exceeded the plan limit. */
export function isOverLimit(plan: PlanDefinition, otpCount: number): boolean {
  if (plan.monthlyOtpLimit === -1) return false;
  return otpCount >= plan.monthlyOtpLimit;
}

/** Returns true if the count is at or above the soft-warn threshold. */
export function isNearLimit(plan: PlanDefinition, otpCount: number): boolean {
  if (plan.monthlyOtpLimit === -1) return false;
  return otpCount >= Math.floor((plan.monthlyOtpLimit * plan.warnAtPercent) / 100);
}

/** Percentage used (0–100+). Returns 0 for unlimited plans. */
export function usagePercent(plan: PlanDefinition, otpCount: number): number {
  if (plan.monthlyOtpLimit === -1) return 0;
  return Math.round((otpCount / plan.monthlyOtpLimit) * 100);
}
