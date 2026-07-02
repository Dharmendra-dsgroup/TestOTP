import mongoose, { Schema, type Document, type Model } from "mongoose";

export type OtpAttemptResult = "success" | "failure" | "expired" | "blocked";

export interface IOtpAttemptDocument extends Document {
  _id: mongoose.Types.ObjectId;
  shopDomain: string;
  otpLogId: mongoose.Types.ObjectId;
  phone?: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
  result: OtpAttemptResult;
  attemptNumber: number;
  createdAt: Date;
}

const OtpAttemptSchema = new Schema<IOtpAttemptDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    otpLogId: {
      type: Schema.Types.ObjectId,
      ref: "OtpLog",
      required: true,
      index: true,
    },
    phone: { type: String },
    email: { type: String, lowercase: true },
    ipAddress: { type: String, required: true, index: true },
    userAgent: { type: String, default: "" },
    result: {
      type: String,
      enum: ["success", "failure", "expired", "blocked"],
      required: true,
    },
    attemptNumber: { type: Number, required: true, min: 1 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "otpAttempts",
  }
);

OtpAttemptSchema.index({ shopDomain: 1, ipAddress: 1, createdAt: -1 });
OtpAttemptSchema.index({ shopDomain: 1, phone: 1, createdAt: -1 }, { sparse: true });
OtpAttemptSchema.index({ otpLogId: 1, result: 1 });

// TTL: auto-delete after 24 hours (used for rate limiting only)
OtpAttemptSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 }
);

export const OtpAttemptModel: Model<IOtpAttemptDocument> =
  (mongoose.models.OtpAttempt as Model<IOtpAttemptDocument>) ??
  mongoose.model<IOtpAttemptDocument>("OtpAttempt", OtpAttemptSchema);

export default OtpAttemptModel;
