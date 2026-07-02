import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { OTP_CHANNEL, OTP_STATUS } from "~/types/otp.types";

export interface IOtpLogDocument extends Document {
  _id: mongoose.Types.ObjectId;
  shopDomain: string;
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
  status: OTP_STATUS;
  ipAddress: string;
  userAgent: string;
  country?: string;
  shopifyCustomerId?: string;
  otpLength: number;
  expirySeconds: number;
  smsProvider?: string;
  smsCost?: number;
  smsSid?: string;
  attempts: number;
  maxAttempts: number;
  sentAt?: Date;
  verifiedAt?: Date;
  failedAt?: Date;
  expiresAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  requestId: string;
  createdAt: Date;
  updatedAt: Date;
}

const OtpLogSchema = new Schema<IOtpLogDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    phone: { type: String },
    email: { type: String, lowercase: true },
    channel: {
      type: String,
      enum: ["sms", "email", "whatsapp", "voice"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "sent", "verified", "expired", "failed", "blocked"],
      default: "pending",
      index: true,
    },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, default: "" },
    country: { type: String, uppercase: true },
    shopifyCustomerId: { type: String },
    otpLength: { type: Number, required: true },
    expirySeconds: { type: Number, required: true },
    smsProvider: { type: String },
    smsCost: { type: Number },
    smsSid: { type: String },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true },
    sentAt: { type: Date },
    verifiedAt: { type: Date },
    failedAt: { type: Date },
    expiresAt: { type: Date },
    errorCode: { type: String },
    errorMessage: { type: String },
    requestId: { type: String, required: true, unique: true },
  },
  {
    timestamps: true,
    collection: "otpLogs",
  }
);

// Query patterns
OtpLogSchema.index({ shopDomain: 1, status: 1, createdAt: -1 });
OtpLogSchema.index({ shopDomain: 1, phone: 1, createdAt: -1 }, { sparse: true });
OtpLogSchema.index({ shopDomain: 1, email: 1, createdAt: -1 }, { sparse: true });
OtpLogSchema.index({ shopDomain: 1, shopifyCustomerId: 1 }, { sparse: true });
OtpLogSchema.index({ ipAddress: 1, createdAt: -1 });

// TTL: auto-delete after 90 days for GDPR compliance
OtpLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

export const OtpLogModel: Model<IOtpLogDocument> =
  (mongoose.models.OtpLog as Model<IOtpLogDocument>) ??
  mongoose.model<IOtpLogDocument>("OtpLog", OtpLogSchema);

export default OtpLogModel;
