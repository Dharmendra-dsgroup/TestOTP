import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { ISubscription } from "~/types/billing.types";

export interface ISubscriptionDocument
  extends Omit<ISubscription, "_id">,
    Document {
  _id: mongoose.Types.ObjectId;
}

const SubscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    shopifySubscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    planKey: {
      type: String,
      required: true,
      enum: ["free", "starter", "growth", "enterprise"],
      index: true,
    },
    planName: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["active", "pending", "cancelled", "declined", "frozen", "expired", "trial"],
      index: true,
    },
    priceUsd: { type: Number, required: true, default: 0, min: 0 },
    trialDays: { type: Number, default: 0, min: 0 },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    shopifyStatus: { type: String, required: true },
    isTest: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "subscriptions",
  }
);

SubscriptionSchema.index({ shopDomain: 1, status: 1 });
SubscriptionSchema.index({ shopDomain: 1, createdAt: -1 });
SubscriptionSchema.index({ currentPeriodEnd: 1, status: 1 });

export const SubscriptionModel: Model<ISubscriptionDocument> =
  (mongoose.models.Subscription as Model<ISubscriptionDocument>) ??
  mongoose.model<ISubscriptionDocument>("Subscription", SubscriptionSchema);

export default SubscriptionModel;
