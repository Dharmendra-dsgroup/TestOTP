import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { ISmsProvider, SmsProviderType, SmsProviderRole, SmsProviderStatus } from "~/types/sms.types";

export interface ISmsProviderDocument extends Omit<ISmsProvider, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const SmsProviderSchema = new Schema<ISmsProviderDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: [
        "default", "twilio", "msg91", "textlocal", "aws_sns", "vonage",
        "exotel", "plivo", "kaleyra", "fast2sms", "gupshup", "infobip",
        "clickatell", "generic_rest",
      ],
      required: true,
    },
    role: {
      type: String,
      enum: ["primary", "secondary", "fallback"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "error", "rate_limited"],
      default: "active",
    },
    credentialsEncrypted: {
      type: String,
      required: true,
      select: false,
    },
    senderId: { type: String },
    webhookUrl: { type: String },
    rateLimitPerMinute: { type: Number, default: 60 },
    priority: { type: Number, default: 1, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    isHealthy: { type: Boolean, default: true },
    lastHealthCheckAt: { type: Date },
    lastErrorAt: { type: Date },
    lastErrorMessage: { type: String },
    totalSent: { type: Number, default: 0 },
    totalFailed: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "smsProviders",
  }
);

SmsProviderSchema.index({ shopDomain: 1, role: 1, isActive: 1, priority: 1 });
SmsProviderSchema.index({ shopDomain: 1, type: 1 });

export const SmsProviderModel: Model<ISmsProviderDocument> =
  (mongoose.models.SmsProvider as Model<ISmsProviderDocument>) ??
  mongoose.model<ISmsProviderDocument>("SmsProvider", SmsProviderSchema);

export default SmsProviderModel;
