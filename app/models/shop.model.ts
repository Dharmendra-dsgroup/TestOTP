import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { IShop, IShopSettings, IShopBilling } from "~/types/shop.types";

export interface IShopDocument extends Omit<IShop, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const ShopSettingsSchema = new Schema<IShopSettings>(
  {
    otpLength: {
      type: Number,
      enum: [4, 5, 6, 8],
      default: 6,
    },
    otpExpiry: {
      type: Number,
      enum: [30, 60, 120, 300, 600],
      default: 120,
    },
    maxAttempts: { type: Number, default: 5, min: 1, max: 10 },
    resendDelay: { type: Number, default: 30, min: 10, max: 300 },
    allowedCountries: { type: [String], default: [] },
    blockedCountries: { type: [String], default: [] },
    smsProviderPrimary: { type: String },
    smsProviderSecondary: { type: String },
    smsProviderFallback: { type: String },
    enableEmailOtp: { type: Boolean, default: false },
    enableSmsOtp: { type: Boolean, default: true },
    brandColor: { type: String },
    logoUrl: { type: String },
    darkMode: { type: Boolean, default: false },
    customCss: { type: String },
    customJs: { type: String },
    buttonText: { type: String, default: "Login with OTP" },
    popupPosition: {
      type: String,
      enum: ["center", "top", "bottom-left", "bottom-right"],
      default: "center",
    },
    widgetType: {
      type: String,
      enum: ["popup", "inline", "slide-over", "floating"],
      default: "popup",
    },
    language: { type: String, default: "en" },
    autoDetectCountry: { type: Boolean, default: true },
    captchaEnabled: { type: Boolean, default: false },
    vpnDetectionEnabled: { type: Boolean, default: false },
    // Shopify Plus — AES-256-GCM encrypted, select: false
    multipassSecret: { type: String, select: false },
    shopifyPlusEnabled: { type: Boolean, default: false },
    loginRedirectUrl: { type: String, default: "/account" },
    // Fraud Detection (Growth+)
    fraudDetectionEnabled: { type: Boolean, default: false },
    ipVelocityWindowMinutes: { type: Number, default: 60, min: 1, max: 1440 },
    ipVelocityLimit: { type: Number, default: 20, min: 1, max: 500 },
    phoneVelocityWindowMinutes: { type: Number, default: 60, min: 1, max: 1440 },
    phoneVelocityLimit: { type: Number, default: 5, min: 1, max: 100 },
    autoBlockEnabled: { type: Boolean, default: false },
    autoBlockThreshold: { type: Number, default: 50, min: 5, max: 500 },
    blockedEmailDomains: { type: [String], default: [] },
  },
  { _id: false }
);

const ShopBillingSchema = new Schema<IShopBilling>(
  {
    planId: { type: String, required: true, default: "free" },
    planName: { type: String, required: true, default: "Free" },
    status: {
      type: String,
      enum: ["active", "pending", "cancelled", "frozen", "declined", "expired", "trial"],
      default: "active",
    },
    trialEndsAt: { type: Date },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    shopifyChargeId: { type: String },
    pendingSubscriptionId: { type: String },
    otpUsedThisPeriod: { type: Number, default: 0, min: 0 },
    otpLimitPerPeriod: { type: Number, default: 100 },
  },
  { _id: false }
);

const ShopSchema = new Schema<IShopDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    shopId: {
      type: String,
      required: true,
      index: true,
    },
    accessToken: {
      type: String,
      required: true,
      select: false,
    },
    scope: { type: String, required: true },
    isInstalled: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    installedAt: { type: Date, default: Date.now },
    uninstalledAt: { type: Date },
    plan: { type: String, default: "free", index: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      default: "",
    },
    name: { type: String, required: true, trim: true, default: "" },
    country: { type: String, uppercase: true, default: "" },
    currency: { type: String, uppercase: true, default: "" },
    timezone: { type: String, default: "" },
    settings: {
      type: ShopSettingsSchema,
      default: () => ({}),
    },
    billing: {
      type: ShopBillingSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: "shops",
  }
);

// Compound indexes for common query patterns
ShopSchema.index({ shopDomain: 1, isInstalled: 1 });
ShopSchema.index({ shopDomain: 1, isActive: 1 });
ShopSchema.index({ "billing.status": 1, plan: 1 });
ShopSchema.index({ installedAt: -1 });
ShopSchema.index({ uninstalledAt: 1 }, { sparse: true });

export const ShopModel: Model<IShopDocument> =
  (mongoose.models.Shop as Model<IShopDocument>) ??
  mongoose.model<IShopDocument>("Shop", ShopSchema);

export default ShopModel;
