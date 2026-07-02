import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface INotificationPreferences {
  emailOnNewCustomer: boolean;
  emailOnFailedOtp: boolean;
  emailOnRateLimit: boolean;
  emailOnProviderError: boolean;
  emailOnBillingEvent: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEvents: string[];
}

export interface IMerchantSettingsDocument extends Document {
  _id: mongoose.Types.ObjectId;
  shopDomain: string;
  notificationEmail?: string;
  notificationPreferences: INotificationPreferences;
  featureOverrides: Record<string, boolean>;
  internalNotes?: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  customMetafields: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationPreferencesSchema = new Schema<INotificationPreferences>(
  {
    emailOnNewCustomer: { type: Boolean, default: false },
    emailOnFailedOtp: { type: Boolean, default: false },
    emailOnRateLimit: { type: Boolean, default: true },
    emailOnProviderError: { type: Boolean, default: true },
    emailOnBillingEvent: { type: Boolean, default: true },
    webhookUrl: { type: String },
    webhookSecret: { type: String, select: false },
    webhookEvents: { type: [String], default: [] },
  },
  { _id: false }
);

const MerchantSettingsSchema = new Schema<IMerchantSettingsDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
    },
    notificationEmail: { type: String, trim: true, lowercase: true },
    notificationPreferences: {
      type: NotificationPreferencesSchema,
      default: () => ({}),
    },
    featureOverrides: { type: Schema.Types.Mixed, default: {} },
    internalNotes: { type: String, select: false },
    onboardingCompleted: { type: Boolean, default: false },
    onboardingStep: { type: Number, default: 0 },
    customMetafields: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    collection: "settings",
  }
);

export const MerchantSettingsModel: Model<IMerchantSettingsDocument> =
  (mongoose.models.MerchantSettings as Model<IMerchantSettingsDocument>) ??
  mongoose.model<IMerchantSettingsDocument>(
    "MerchantSettings",
    MerchantSettingsSchema
  );

export default MerchantSettingsModel;
