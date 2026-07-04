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
import { encrypt, decrypt } from "~/utils/crypto";
import { env } from "~/config/env";
import {
  generateMultipassToken,
  buildMultipassUrl,
} from "~/lib/shopify/multipass.server";

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
      | "smsTemplate"
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

  async updateSettings(
    shopDomain: string,
    data: Partial<ShopSettingsUpdateInput>
  ): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      const shop = await shopRepository.updateSettings(shopDomain, data);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] updateSettings failed:", error);
      return serviceFailure("Failed to update settings", 500);
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

  async updateMultipassSettings(
    shopDomain: string,
    data: { shopifyPlusEnabled: boolean; multipassSecret?: string }
  ): Promise<ServiceResult<IShopDocument["settings"]>> {
    try {
      const update: Partial<ShopSettingsUpdateInput> = {
        shopifyPlusEnabled: data.shopifyPlusEnabled,
      };
      if (data.multipassSecret?.trim()) {
        update.multipassSecret = encrypt(data.multipassSecret.trim(), env.ENCRYPTION_KEY);
      }
      const shop = await shopRepository.updateSettings(shopDomain, update);
      if (!shop) return serviceFailure("Shop not found", 404);
      return serviceSuccess(shop.settings);
    } catch (error) {
      console.error("[SettingsService] updateMultipassSettings failed:", error);
      return serviceFailure("Failed to update Multipass settings", 500);
    }
  }

  async clearMultipassSecret(shopDomain: string): Promise<ServiceResult<void>> {
    try {
      await shopRepository.clearSettingField(shopDomain, "multipassSecret");
      await shopRepository.updateSettings(shopDomain, { shopifyPlusEnabled: false });
      return serviceSuccess(undefined);
    } catch (error) {
      console.error("[SettingsService] clearMultipassSecret failed:", error);
      return serviceFailure("Failed to clear Multipass secret", 500);
    }
  }

  async getMultipassTestUrl(shopDomain: string): Promise<ServiceResult<string>> {
    try {
      const shop = await shopRepository.findByDomainWithMultipassSecret(shopDomain);
      if (!shop?.settings?.multipassSecret) {
        return serviceFailure("No Multipass secret configured. Save a secret first.", 400);
      }
      const plainSecret = decrypt(shop.settings.multipassSecret, env.ENCRYPTION_KEY);
      const token = generateMultipassToken(
        {
          email: "test@multipass-verify.example.com",
          created_at: new Date().toISOString(),
          return_to: "/account",
        },
        plainSecret
      );
      return serviceSuccess(buildMultipassUrl(shopDomain, token));
    } catch (error) {
      console.error("[SettingsService] getMultipassTestUrl failed:", error);
      return serviceFailure("Failed to generate test URL — check your secret is correct", 500);
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
