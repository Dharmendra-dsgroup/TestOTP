import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { ICustomer } from "~/types/customer.types";

export interface ICustomerDocument extends Omit<ICustomer, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const CustomerSchema = new Schema<ICustomerDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    shopifyCustomerId: {
      type: String,
      required: true,
    },
    phone: { type: String, trim: true },
    phoneNormalized: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date },
    emailVerifiedAt: { type: Date },
    verificationChannel: {
      type: String,
      enum: ["sms", "email", "whatsapp"],
    },
    tags: { type: [String], default: [] },
    acceptsMarketing: { type: Boolean, default: false },
    totalOtpRequests: { type: Number, default: 0, min: 0 },
    totalSuccessfulVerifications: { type: Number, default: 0, min: 0 },
    lastOtpRequestAt: { type: Date },
    lastLoginAt: { type: Date },
    loginCount: { type: Number, default: 0, min: 0 },
    isBlocked: { type: Boolean, default: false, index: true },
    blockedReason: { type: String },
    blockedAt: { type: Date },
    countryCode: { type: String, uppercase: true },
    locale: { type: String },
  },
  {
    timestamps: true,
    collection: "customers",
  }
);

// shopifyCustomerId is unique per shop, not globally
CustomerSchema.index(
  { shopDomain: 1, shopifyCustomerId: 1 },
  { unique: true }
);
CustomerSchema.index({ shopDomain: 1, phone: 1 }, { sparse: true });
CustomerSchema.index({ shopDomain: 1, phoneNormalized: 1 }, { sparse: true });
CustomerSchema.index({ shopDomain: 1, email: 1 }, { sparse: true });
CustomerSchema.index({ shopDomain: 1, isBlocked: 1 });
CustomerSchema.index({ shopDomain: 1, lastLoginAt: -1 });
CustomerSchema.index({ shopDomain: 1, createdAt: -1 });

export const CustomerModel: Model<ICustomerDocument> =
  (mongoose.models.Customer as Model<ICustomerDocument>) ??
  mongoose.model<ICustomerDocument>("Customer", CustomerSchema);

export default CustomerModel;
