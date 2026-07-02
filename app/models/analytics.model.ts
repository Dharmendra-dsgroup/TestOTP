import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { IAnalyticsRecord, AnalyticsPeriod } from "~/types/analytics.types";

export interface IAnalyticsDocument extends Omit<IAnalyticsRecord, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const AnalyticsSchema = new Schema<IAnalyticsDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    period: {
      type: String,
      enum: ["hourly", "daily", "weekly", "monthly"],
      required: true,
    },
    periodKey: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    otpRequested: { type: Number, default: 0 },
    otpSent: { type: Number, default: 0 },
    otpVerified: { type: Number, default: 0 },
    otpFailed: { type: Number, default: 0 },
    otpExpired: { type: Number, default: 0 },
    otpBlocked: { type: Number, default: 0 },
    newCustomers: { type: Number, default: 0 },
    returningCustomers: { type: Number, default: 0 },
    loginCount: { type: Number, default: 0 },
    registrationCount: { type: Number, default: 0 },
    smsDelivered: { type: Number, default: 0 },
    smsFailed: { type: Number, default: 0 },
    emailDelivered: { type: Number, default: 0 },
    emailFailed: { type: Number, default: 0 },
    byCountry: { type: Schema.Types.Mixed, default: {} },
    byChannel: {
      type: {
        sms: { type: Number, default: 0 },
        email: { type: Number, default: 0 },
        whatsapp: { type: Number, default: 0 },
        voice: { type: Number, default: 0 },
      },
      default: () => ({ sms: 0, email: 0, whatsapp: 0, voice: 0 }),
      _id: false,
    },
    avgVerificationTimeMs: { type: Number, default: 0 },
    successRate: { type: Number, default: 0, min: 0, max: 100 },
  },
  {
    timestamps: true,
    collection: "analytics",
  }
);

// One record per shop per period per periodKey
AnalyticsSchema.index(
  { shopDomain: 1, period: 1, periodKey: 1 },
  { unique: true }
);
AnalyticsSchema.index({ shopDomain: 1, period: 1, periodStart: -1 });

// TTL: keep hourly for 7 days, daily for 2 years, weekly/monthly forever
// We handle daily cleanup via a job; TTL on hourly only
AnalyticsSchema.index(
  { period: 1, createdAt: 1 },
  {
    expireAfterSeconds: 60 * 60 * 24 * 7,
    partialFilterExpression: { period: "hourly" },
  }
);

export const AnalyticsModel: Model<IAnalyticsDocument> =
  (mongoose.models.Analytics as Model<IAnalyticsDocument>) ??
  mongoose.model<IAnalyticsDocument>("Analytics", AnalyticsSchema);

export default AnalyticsModel;
