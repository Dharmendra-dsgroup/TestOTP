import { planRepository } from "~/repositories/plan.repository";
import { subscriptionRepository } from "~/repositories/subscription.repository";
import type { IPlanDocument } from "~/models/plan.model";
import type { ISubscriptionDocument } from "~/models/subscription.model";
import type { PlanId } from "~/types/billing.types";
import { PLAN_FEATURES } from "~/types/billing.types";
import {
  type ServiceResult,
  serviceSuccess,
  serviceFailure,
} from "~/types/common.types";

export class PlanService {
  async getAllPlans(): Promise<ServiceResult<IPlanDocument[]>> {
    try {
      const plans = await planRepository.findAllActive();
      return serviceSuccess(plans);
    } catch (error) {
      console.error("[PlanService] getAllPlans failed:", error);
      return serviceFailure("Failed to load plans", 500);
    }
  }

  async getPlanById(planId: PlanId): Promise<ServiceResult<IPlanDocument>> {
    try {
      const plan = await planRepository.findByPlanId(planId);
      if (!plan) return serviceFailure(`Plan not found: ${planId}`, 404);
      return serviceSuccess(plan);
    } catch (error) {
      console.error("[PlanService] getPlanById failed:", error);
      return serviceFailure("Failed to load plan", 500);
    }
  }

  async getSubscription(
    shopDomain: string
  ): Promise<ServiceResult<ISubscriptionDocument | null>> {
    try {
      const sub = await subscriptionRepository.findByShop(shopDomain);
      return serviceSuccess(sub);
    } catch (error) {
      console.error("[PlanService] getSubscription failed:", error);
      return serviceFailure("Failed to load subscription", 500);
    }
  }

  async getShopPlanId(shopDomain: string): Promise<PlanId> {
    try {
      const sub = await subscriptionRepository.findByShop(shopDomain);
      return (sub?.planId ?? "free") as PlanId;
    } catch {
      return "free";
    }
  }

  /**
   * Checks if a specific feature is available on the shop's current plan.
   */
  async hasFeature(
    shopDomain: string,
    feature: string
  ): Promise<ServiceResult<boolean>> {
    try {
      const planId = await this.getShopPlanId(shopDomain);
      const featureFlags = PLAN_FEATURES[planId];
      const hasIt = featureFlags?.[feature] ?? false;
      return serviceSuccess(hasIt);
    } catch (error) {
      console.error("[PlanService] hasFeature failed:", error);
      return serviceFailure("Failed to check feature", 500);
    }
  }

  /**
   * Creates or updates a shop's subscription to a plan.
   */
  async upsertSubscription(
    shopDomain: string,
    planId: PlanId,
    options: {
      shopifyChargeId?: string;
      shopifyConfirmationUrl?: string;
    } = {}
  ): Promise<ServiceResult<ISubscriptionDocument>> {
    try {
      const existing = await subscriptionRepository.findByShop(shopDomain);
      const sub = await subscriptionRepository.upsertForShop(shopDomain, {
        planId,
        previousPlanId: existing?.planId,
        status: options.shopifyChargeId ? "active" : "pending",
        shopifyChargeId: options.shopifyChargeId,
        shopifyConfirmationUrl: options.shopifyConfirmationUrl,
        activatedAt: options.shopifyChargeId ? new Date() : undefined,
      } as Partial<ISubscriptionDocument>);
      return serviceSuccess(sub);
    } catch (error) {
      console.error("[PlanService] upsertSubscription failed:", error);
      return serviceFailure("Failed to update subscription", 500);
    }
  }
}

export const planService = new PlanService();
