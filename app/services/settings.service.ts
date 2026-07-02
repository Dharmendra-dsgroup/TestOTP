import { shopRepository } from "~/repositories/shop.repository";
import { merchantSettingsRepository } from "~/repositories/merchant-settings.repository";
import type { IShopDocument } from "~/models/shop.model";
import type { IMerchantSettingsDocument } from "~/models/merchant-settings.model";
import type { ShopSettingsUpdateInput } from "~/types/shop.types";
import {
  type ServiceResult,
  serviceSuccess,
  serviceFailure,
} from "~/types/common.types";

export class SettingsService {
  async getShopSettings(shopDomain: string): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      const shop = await shopRepository.findByDomain(shopDomain);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] getShopSettings failed:", error);
      return serviceFailure("Failed to load settings", 500);
    }
  }

  async updateGeneralSettings(
    shopDomain: string,
    data: Pick<
      ShopSettingsUpdateInput,
      | "buttonText"
      | "brandColor"
      | "logoUrl"
      | "darkMode"
      | "widgetType"
      | "popupPosition"
      | "customCss"
      | "customJs"
      | "language"
    >
  ): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      const shop = await shopRepository.updateSettings(shopDomain, data);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] updateGeneralSettings failed:", error);
      return serviceFailure("Failed to update settings", 500);
    }
  }

  async updateOtpSettings(
    shopDomain: string,
    data: Pick<
      ShopSettingsUpdateInput,
      | "otpLength"
      | "otpExpiry"
      | "maxAttempts"
      | "resendDelay"
      | "enableSmsOtp"
      | "enableEmailOtp"
    >
  ): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      const shop = await shopRepository.updateSettings(shopDomain, data);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] updateOtpSettings failed:", error);
      return serviceFailure("Failed to update OTP settings", 500);
    }
  }

  async updateSecuritySettings(
    shopDomain: string,
    data: Pick<
      ShopSettingsUpdateInput,
      "captchaEnabled" | "vpnDetectionEnabled" | "autoDetectCountry"
    >
  ): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      const shop = await shopRepository.updateSettings(shopDomain, data);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] updateSecuritySettings failed:", error);
      return serviceFailure("Failed to update security settings", 500);
    }
  }

  async updateCountrySettings(
    shopDomain: string,
    data: Pick<ShopSettingsUpdateInput, "allowedCountries" | "blockedCountries">
  ): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      // Validate: a country cannot be in both lists
      const both = (data.allowedCountries ?? []).filter((c) =>
        (data.blockedCountries ?? []).includes(c)
      );
      if (both.length > 0) {
        return serviceFailure(
          `Countries cannot be in both allow and block lists: ${both.join(", ")}`,
          400
        );
      }
      const shop = await shopRepository.updateSettings(shopDomain, data);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] updateCountrySettings failed:", error);
      return serviceFailure("Failed to update country settings", 500);
    }
  }

  async getMerchantSettings(
    shopDomain: string
  ): Promise<ServiceResult<IMerchantSettingsDocument>> {
    try {
      const settings = await merchantSettingsRepository.findByShop(shopDomain);
      if (!settings) {
        // Auto-create on first access
        const created = await merchantSettingsRepository.upsertForShop(shopDomain, {});
        return serviceSuccess(created);
      }
      return serviceSuccess(settings);
    } catch (error) {
      console.error("[SettingsService] getMerchantSettings failed:", error);
      return serviceFailure("Failed to load merchant settings", 500);
    }
  }

  async updateMerchantSettings(
    shopDomain: string,
    data: Partial<IMerchantSettingsDocument>
  ): Promise<ServiceResult<IMerchantSettingsDocument>> {
    try {
      const settings = await merchantSettingsRepository.upsertForShop(shopDomain, data);
      return serviceSuccess(settings);
    } catch (error) {
      console.error("[SettingsService] updateMerchantSettings failed:", error);
      return serviceFailure("Failed to update merchant settings", 500);
    }
  }
}

export const settingsService = new SettingsService();
