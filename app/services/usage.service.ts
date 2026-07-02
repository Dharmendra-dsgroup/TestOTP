import { usageRepository } from "~/repositories/usage.repository";
import type { IUsageDocument } from "~/models/usage.model";
import type { PlanId } from "~/types/billing.types";
import {
  type ServiceResult,
  serviceSuccess,
  serviceFailure,
} from "~/types/common.types";

function getCurrentPeriodKey(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getPeriodBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { start, end };
}

export class UsageService {
  async getCurrentUsage(
    shopDomain: string,
    planId: PlanId = "free"
  ): Promise<ServiceResult<IUsageDocument>> {
    try {
      const periodKey = getCurrentPeriodKey();
      const { start, end } = getPeriodBounds();
      const usage = await usageRepository.findOrCreateForPeriod(
        shopDomain,
        periodKey,
        planId,
        start,
        end
      );
      return serviceSuccess(usage);
    } catch (error) {
      console.error("[UsageService] getCurrentUsage failed:", error);
      return serviceFailure("Failed to get usage data", 500);
    }
  }

  async incrementOtpSent(
    shopDomain: string,
    planId: PlanId = "free"
  ): Promise<void> {
    try {
      const periodKey = getCurrentPeriodKey();
      const { start, end } = getPeriodBounds();
      await usageRepository.findOrCreateForPeriod(shopDomain, periodKey, planId, start, end);
      await usageRepository.incrementField(shopDomain, periodKey, "otpSent");
    } catch (error) {
      console.error("[UsageService] incrementOtpSent failed:", error);
    }
  }

  async incrementOtpVerified(shopDomain: string): Promise<void> {
    try {
      const periodKey = getCurrentPeriodKey();
      await usageRepository.incrementField(shopDomain, periodKey, "otpVerified");
    } catch (error) {
      console.error("[UsageService] incrementOtpVerified failed:", error);
    }
  }

  async incrementSmsSent(shopDomain: string): Promise<void> {
    try {
      const periodKey = getCurrentPeriodKey();
      await usageRepository.incrementField(shopDomain, periodKey, "smsSent");
    } catch (error) {
      console.error("[UsageService] incrementSmsSent failed:", error);
    }
  }
}

export const usageService = new UsageService();
