import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { IPlan, PlanId, BillingInterval } from "~/types/billing.types";

export interface IPlanDocument extends Omit<IPlan, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const PlanSchema = new Schema<IPlanDocument>(
  {
    planId: {
      type: String,
      required: true,
      unique: true,
      enum: ["free", "starter", "growth", "enterprise"],
    },
    name: { type: String, required: true },
    description: { type: String, required: true, default: "" },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD", uppercase: true },
    interval: {
      type: String,
      enum: ["monthly", "annual"],
      default: "monthly",
    },
    otpLimit: { type: Number, required: true },
    features: { type: [String], default: [] },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    trialDays: { type: Number, default: 0, min: 0 },
    sortOrder: { type: Number, default: 0 },
    shopifyPlanHandle: { type: String },
  },
  {
    timestamps: true,
    collection: "plans",
  }
);

PlanSchema.index({ isActive: 1, sortOrder: 1 });

export const PlanModel: Model<IPlanDocument> =
  (mongoose.models.Plan as Model<IPlanDocument>) ??
  mongoose.model<IPlanDocument>("Plan", PlanSchema);

export default PlanModel;
