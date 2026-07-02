import type { PlanKey } from "~/config/plans";
import type { TimestampFields } from "./common.types";

// Re-export for backward compatibility with any existing imports
export type { PlanKey };
export type PlanId = PlanKey;

export type BillingInterval = "monthly" | "annual";

/**
 * Maps to Shopify AppSubscriptionStatus enum values plus our virtual "trial" state.
 * ACTIVE + within trialDays window → "trial"
 * ACTIVE + past trial → "active"
 */
export type SubscriptionStatus =
  | "active"
  | "pending"
  | "cancelled"
  | "declined"
  | "frozen"
  | "expired"
  | "trial";

// ─── MongoDB Subscription Record ──────────────────────────────────────────────

/** Immutable per-event record stored in the `subscriptions` collection. */
export interface ISubscription extends TimestampFields {
  shopDomain: string;
  /** Shopify GID: gid://shopify/AppSubscription/123456 */
  shopifySubscriptionId: string;
  planKey: PlanKey;
  planName: string;
  status: SubscriptionStatus;
  priceUsd: number;
  trialDays: number;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  activatedAt: Date | null;
  cancelledAt: Date | null;
  /** Raw Shopify status string — preserved verbatim for debugging / audits. */
  shopifyStatus: string;
  /** True when using Shopify's test billing mode. */
  isTest: boolean;
}

export type SubscriptionCreateInput = Omit<
  ISubscription,
  "_id" | "createdAt" | "updatedAt"
>;

// ─── Shopify Billing API shapes ───────────────────────────────────────────────

export interface ShopifyAppSubscriptionNode {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  currentPeriodEnd: string | null;
  trialDays: number;
  test: boolean;
}

export interface ShopifyCreateSubscriptionResult {
  appSubscriptionCreate: {
    userErrors: Array<{ field: string[]; message: string }>;
    confirmationUrl: string | null;
    appSubscription: ShopifyAppSubscriptionNode | null;
  };
}

export interface ShopifyCancelSubscriptionResult {
  appSubscriptionCancel: {
    userErrors: Array<{ field: string[]; message: string }>;
    appSubscription: { id: string; status: string } | null;
  };
}

export interface ShopifyActiveSubscriptionsResult {
  currentAppInstallation: {
    activeSubscriptions: ShopifyAppSubscriptionNode[];
  };
}

// ─── BillingService result types ─────────────────────────────────────────────

export interface CreateSubscriptionResult {
  /** Shopify-hosted URL the merchant visits to approve billing. */
  confirmationUrl: string;
  shopifySubscriptionId: string;
}

export interface ActiveSubscriptionInfo {
  shopifySubscriptionId: string;
  planKey: PlanKey;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

// ─── Plan limit check ─────────────────────────────────────────────────────────

export interface PlanLimitCheck {
  allowed: boolean;
  currentCount: number;
  /** Plan limit. -1 = unlimited. */
  limit: number;
  nearLimit: boolean;
}

// ─── Feature flag map (kept for backward compat, derived from plans.ts) ──────

export const PLAN_FEATURES: Record<PlanKey, Record<string, boolean>> = {
  free: {
    customBranding: false,
    customTemplates: false,
    multipleProviders: false,
    providerFailover: false,
    emailOtp: false,
    advancedAnalytics: false,
    fraudProtection: false,
    multipassLogin: false,
    voiceOtp: false,
    whatsappOtp: false,
  },
  starter: {
    customBranding: true,
    customTemplates: true,
    multipleProviders: false,
    providerFailover: false,
    emailOtp: true,
    advancedAnalytics: false,
    fraudProtection: false,
    multipassLogin: false,
    voiceOtp: false,
    whatsappOtp: false,
  },
  growth: {
    customBranding: true,
    customTemplates: true,
    multipleProviders: true,
    providerFailover: true,
    emailOtp: true,
    advancedAnalytics: true,
    fraudProtection: true,
    multipassLogin: false,
    voiceOtp: false,
    whatsappOtp: false,
  },
  enterprise: {
    customBranding: true,
    customTemplates: true,
    multipleProviders: true,
    providerFailover: true,
    emailOtp: true,
    advancedAnalytics: true,
    fraudProtection: true,
    multipassLogin: true,
    voiceOtp: true,
    whatsappOtp: true,
  },
};

// ─── Usage record (kept for backward compat) ─────────────────────────────────

export interface IUsage extends TimestampFields {
  shopDomain: string;
  planKey: PlanKey;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  otpSent: number;
  otpVerified: number;
  smsSent: number;
  emailSent: number;
}
