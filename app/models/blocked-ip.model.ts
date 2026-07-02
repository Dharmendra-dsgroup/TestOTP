import mongoose, { Schema, type Document, type Model } from "mongoose";

export type BlockReason =
  | "manual"
  | "rate_limit"
  | "fraud_detection"
  | "vpn_detected"
  | "too_many_failures";

export interface IBlockedIpDocument extends Document {
  _id: mongoose.Types.ObjectId;
  shopDomain?: string;
  ipAddress: string;
  reason: BlockReason;
  blockedBy: "auto" | "manual";
  notes?: string;
  expiresAt?: Date;
  isGlobal: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BlockedIpSchema = new Schema<IBlockedIpDocument>(
  {
    shopDomain: {
      type: String,
      lowercase: true,
      sparse: true,
    },
    ipAddress: {
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
    collection: "blockedIps",
  }
);

// Unique: one block record per IP per shop (null shopDomain = global)
BlockedIpSchema.index(
  { ipAddress: 1, shopDomain: 1 },
  { unique: true, sparse: true }
);
BlockedIpSchema.index({ shopDomain: 1, ipAddress: 1 });
BlockedIpSchema.index({ isGlobal: 1, ipAddress: 1 });

// TTL on expiresAt for temporary blocks
BlockedIpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, sparse: true }
);

export const BlockedIpModel: Model<IBlockedIpDocument> =
  (mongoose.models.BlockedIp as Model<IBlockedIpDocument>) ??
  mongoose.model<IBlockedIpDocument>("BlockedIp", BlockedIpSchema);

export default BlockedIpModel;
