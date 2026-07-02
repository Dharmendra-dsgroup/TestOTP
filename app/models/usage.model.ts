import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { IUsage, PlanId } from "~/types/billing.types";

export interface IUsageDocument extends Omit<IUsage, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const UsageSchema = new Schema<IUsageDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    planId: {
      type: String,
      enum: ["free", "starter", "growth", "enterprise"],
      required: true,
    },
    periodKey: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    otpSent: { type: Number, default: 0, min: 0 },
    otpVerified: { type: Number, default: 0, min: 0 },
    smsSent: { type: Number, default: 0, min: 0 },
    emailSent: { type: Number, default: 0, min: 0 },
    whatsappSent: { type: Number, default: 0, min: 0 },
    voiceSent: { type: Number, default: 0, min: 0 },
    apiCalls: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    collection: "usage",
  }
);

// One record per shop per billing period
UsageSchema.index({ shopDomain: 1, periodKey: 1 }, { unique: true });
UsageSchema.index({ periodStart: 1, periodEnd: 1 });

export const UsageModel: Model<IUsageDocument> =
  (mongoose.models.Usage as Model<IUsageDocument>) ??
  mongoose.model<IUsageDocument>("Usage", UsageSchema);

export default UsageModel;
