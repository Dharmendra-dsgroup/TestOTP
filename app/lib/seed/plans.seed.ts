import { planRepository } from "~/repositories/plan.repository";
import { PLAN_FEATURES } from "~/types/billing.types";
import type { IPlanDocument } from "~/models/plan.model";
import connectToDatabase from "~/config/database";

const DEFAULT_PLANS: Array<Partial<IPlanDocument>> = [
  {
    planId: "free",
    name: "Free",
    description: "Get started with OTP Login at no cost.",
    price: 0,
    currency: "USD",
    interval: "monthly",
    otpLimit: 100,
    features: [
      "100 OTP / month",
      "Default SMS Gateway",
      "Basic Widget",
      "Basic Analytics",
      "Community Support",
    ],
    featureFlags: PLAN_FEATURES.free,
    isPublic: true,
    isActive: true,
    trialDays: 0,
    sortOrder: 1,
  },
  {
    planId: "starter",
    name: "Starter",
    description: "For growing stores that need branded OTP login.",
    price: 9.99,
    currency: "USD",
    interval: "monthly",
    otpLimit: 1_000,
    features: [
      "1,000 OTP / month",
      "1 Custom SMS Provider",
      "Custom Branding & Colors",
      "SMS Templates",
      "Email Support",
    ],
    featureFlags: PLAN_FEATURES.starter,
    isPublic: true,
    isActive: true,
    trialDays: 7,
    sortOrder: 2,
  },
  {
    planId: "growth",
    name: "Growth",
    description: "For scaling stores with advanced fraud protection and analytics.",
    price: 29.99,
    currency: "USD",
    interval: "monthly",
    otpLimit: 10_000,
    features: [
      "10,000 OTP / month",
      "Unlimited SMS Providers",
      "Automatic Provider Failover",
      "Email OTP Channel",
      "Advanced Analytics & Export",
      "Webhooks",
      "Public API Access",
      "Fraud Protection",
      "Flutter SDK",
    ],
    featureFlags: PLAN_FEATURES.growth,
    isPublic: true,
    isActive: true,
    trialDays: 7,
    sortOrder: 3,
  },
  {
    planId: "enterprise",
    name: "Enterprise",
    description: "For high-volume stores needing unlimited scale and white-label.",
    price: 99.99,
    currency: "USD",
    interval: "monthly",
    otpLimit: -1,
    features: [
      "Unlimited OTP",
      "Voice OTP",
      "WhatsApp OTP",
      "White Label (remove branding)",
      "Multi-Store Support",
      "Dedicated Infrastructure",
      "Priority 24/7 Support",
      "Custom SLA",
    ],
    featureFlags: PLAN_FEATURES.enterprise,
    isPublic: true,
    isActive: true,
    trialDays: 14,
    sortOrder: 4,
  },
];

export async function seedPlans(): Promise<void> {
  await connectToDatabase();

  console.info("[Seed] Seeding plans...");

  for (const plan of DEFAULT_PLANS) {
    await planRepository.upsertPlan(plan);
    console.info(`[Seed] Upserted plan: ${plan.planId}`);
  }

  console.info("[Seed] Plans seeded successfully");
}
