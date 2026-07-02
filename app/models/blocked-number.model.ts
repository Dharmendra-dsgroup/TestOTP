import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { BlockReason } from "./blocked-ip.model";

export interface IBlockedNumberDocument extends Document {
  _id: mongoose.Types.ObjectId;
  shopDomain?: string;
  phone: string;
  reason: BlockReason;
  blockedBy: "auto" | "manual";
  notes?: string;
  expiresAt?: Date;
  isGlobal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BlockedNumberSchema = new Schema<IBlockedNumberDocument>(
  {
    shopDomain: {
      type: String,
      lowercase: true,
      sparse: true,
    },
    phone: {
      type: String,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: [
        "manual",
        "rate_limit",
        "fraud_detection",
        "vpn_detected",
        "too_many_failures",
      ],
      required: true,
    },
    blockedBy: {
      type: String,
      enum: ["auto", "manual"],
      required: true,
    },
    notes: { type: String },
    expiresAt: { type: Date },
    isGlobal: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "blockedNumbers",
  }
);

BlockedNumberSchema.index(
  { phone: 1, shopDomain: 1 },
  { unique: true, sparse: true }
);
BlockedNumberSchema.index({ shopDomain: 1, phone: 1 });
BlockedNumberSchema.index({ isGlobal: 1, phone: 1 });
BlockedNumberSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true }
);

export const BlockedNumberModel: Model<IBlockedNumberDocument> =
  (mongoose.models.BlockedNumber as Model<IBlockedNumberDocument>) ??
  mongoose.model<IBlockedNumberDocument>("BlockedNumber", BlockedNumberSchema);

export default BlockedNumberModel;
