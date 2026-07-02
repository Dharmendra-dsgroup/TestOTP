import type { TimestampFields } from "./common.types";
import type { OTP_LENGTH, OTP_EXPIRY } from "./otp.types";

export interface IShopSettings {
  otpLength: OTP_LENGTH;
  otpExpiry: OTP_EXPIRY;
  maxAttempts: number;
  resendDelay: number;
  allowedCountries: string[];
  blockedCountries: string[];
  smsProviderPrimary?: string;
  smsProviderSecondary?: string;
  smsProviderFallback?: string;
  enableEmailOtp: boolean;
  enableSmsOtp: boolean;
  brandColor?: string;
  logoUrl?: string;
  darkMode: boolean;
  customCss?: string;
  customJs?: string;
  buttonText: string;
  popupPosition: "center" | "top" | "bottom-left" | "bottom-right";
  widgetType: "popup" | "inline" | "slide-over" | "floating";
  language: string;
  autoDetectCountry: boolean;
  captchaEnabled: boolean;
  vpnDetectionEnabled: boolean;
  // Shopify Plus — stored AES-256-GCM encrypted via encrypt()
  multipassSecret?: string;
  shopifyPlusEnabled: boolean;
  // Post-login redirect destination (default: /account)
  loginRedirectUrl: string;
  // ── Fraud Detection (Growth+ plan) ──────────────────────────────────────
  fraudDetectionEnabled: boolean;
  /** Minutes for the IP velocity sliding window (default: 60) */
  ipVelocityWindowMinutes: number;
  /** Max OTP requests per IP per window (default: 20) */
  ipVelocityLimit: number;
  /** Minutes for the phone/email velocity sliding window (default: 60) */
  phoneVelocityWindowMinutes: number;
  /** Max OTP requests per phone/email per window (default: 5) */
  phoneVelocityLimit: number;
  /** Automatically add IP to blocklist after N velocity violations per day */
  autoBlockEnabled: boolean;
  autoBlockThreshold: number;
  /** Email domains blocked from receiving OTPs */
  blockedEmailDomains: string[];
}

export interface IShopBilling {
  planId: string;
  planName: string;
  status: "active" | "pending" | "cancelled" | "frozen" | "declined" | "expired" | "trial";
  trialEndsAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  /** Shopify AppSubscription GID for the active subscription. */
  shopifyChargeId?: string;
  /**
   * Temporary GID stored when a subscription is created but not yet confirmed.
   * Cleared after the merchant approves or declines billing.
   */
  pendingSubscriptionId?: string;
  otpUsedThisPeriod: number;
  otpLimitPerPeriod: number;
}

export interface IShop extends TimestampFields {
  shopDomain: string;
  shopId: string;
  accessToken: string;
  scope: string;
  isInstalled: boolean;
  isActive: boolean;
  installedAt: Date;
  uninstalledAt?: Date;
  plan: string;
  email: string;
  name: string;
  country: string;
  currency: string;
  timezone: string;
  settings: IShopSettings;
  billing: IShopBilling;
}

export type ShopCreateInput = Pick<
  IShop,
  | "shopDomain"
  | "shopId"
  | "accessToken"
  | "scope"
  | "email"
  | "name"
  | "country"
  | "currency"
  | "timezone"
>;

export type ShopUpdateInput = Partial<
  Omit<IShop, "shopDomain" | "shopId" | "createdAt">
>;

export type ShopSettingsUpdateInput = Partial<IShopSettings>;
