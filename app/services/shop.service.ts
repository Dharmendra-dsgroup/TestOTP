import { shopRepository } from "~/repositories/shop.repository";
import type { IShopDocument } from "~/models/shop.model";
import type { ShopCreateInput } from "~/types/shop.types";
import {
  type ServiceResult,
  serviceSuccess,
  serviceFailure,
} from "~/types/common.types";

export class ShopService {
  async getOrCreateShop(
    data: ShopCreateInput
  ): Promise<ServiceResult<IShopDocument>> {
    try {
      const shop = await shopRepository.upsertByDomain(data.shopDomain, data);
      return serviceSuccess(shop);
    } catch (error) {
      console.error("[ShopService] getOrCreateShop failed:", error);
      return serviceFailure("Failed to create or update shop", 500);
    }
  }

  async getShopByDomain(
    shopDomain: string
  ): Promise<ServiceResult<IShopDocument>> {
    try {
      const shop = await shopRepository.findByDomain(shopDomain);
      if (!shop) {
        return serviceFailure(`Shop not found: ${shopDomain}`, 404);
      }
      return serviceSuccess(shop);
    } catch (error) {
      console.error("[ShopService] getShopByDomain failed:", error);
      return serviceFailure("Failed to retrieve shop", 500);
    }
  }

  async getShopWithToken(
    shopDomain: string
  ): Promise<ServiceResult<IShopDocument>> {
    try {
      const shop = await shopRepository.findByDomainWithToken(shopDomain);
      if (!shop) {
        return serviceFailure(`Shop not found: ${shopDomain}`, 404);
      }
      return serviceSuccess(shop);
    } catch (error) {
      console.error("[ShopService] getShopWithToken failed:", error);
      return serviceFailure("Failed to retrieve shop", 500);
    }
  }

  async markShopUninstalled(shopDomain: string): Promise<ServiceResult<void>> {
    try {
      await shopRepository.markUninstalled(shopDomain);
      return serviceSuccess(undefined);
    } catch (error) {
      console.error("[ShopService] markShopUninstalled failed:", error);
      return serviceFailure("Failed to update shop status", 500);
    }
  }

  async updateShopSettings(
    shopDomain: string,
    settings: Partial<IShopDocument["settings"]>
  ): Promise<ServiceResult<IShopDocument>> {
    try {
      const shop = await shopRepository.updateSettings(shopDomain, settings);
      if (!shop) {
        return serviceFailure(`Shop not found: ${shopDomain}`, 404);
      }
      return serviceSuccess(shop);
    } catch (error) {
      console.error("[ShopService] updateShopSettings failed:", error);
      return serviceFailure("Failed to update settings", 500);
    }
  }

  async canSendOtp(shopDomain: string): Promise<ServiceResult<boolean>> {
    try {
      const shop = await shopRepository.findByDomain(shopDomain);
      if (!shop) {
        return serviceFailure("Shop not found", 404);
      }

      if (!shop.isActive || !shop.isInstalled) {
        return serviceFailure("Shop is not active", 403);
      }

      const { otpUsedThisPeriod, otpLimitPerPeriod } = shop.billing;

      if (otpLimitPerPeriod !== -1 && otpUsedThisPeriod >= otpLimitPerPeriod) {
        return serviceFailure("OTP limit reached for this billing period", 429);
      }

      return serviceSuccess(true);
    } catch (error) {
      console.error("[ShopService] canSendOtp failed:", error);
      return serviceFailure("Failed to check OTP quota", 500);
    }
  }
}

export const shopService = new ShopService();
