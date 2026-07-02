import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { ISmsTemplate } from "~/types/sms.types";

export interface ISmsTemplateDocument extends Omit<ISmsTemplate, "_id">, Document {
  _id: mongoose.Types.ObjectId;
}

const SmsTemplateSchema = new Schema<ISmsTemplateDocument>(
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
      enum: ["login", "signup", "verification", "password_reset", "custom"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 160,
    },
    language: { type: String, default: "en", length: 2 },
    isDefault: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true },
    variables: { type: [String], default: [] },
    previewText: { type: String },
  },
  {
    timestamps: true,
    collection: "smsTemplates",
  }
);

SmsTemplateSchema.index({ shopDomain: 1, type: 1, language: 1 });
SmsTemplateSchema.index({ shopDomain: 1, isDefault: 1, type: 1 });

export const SmsTemplateModel: Model<ISmsTemplateDocument> =
  (mongoose.models.SmsTemplate as Model<ISmsTemplateDocument>) ??
  mongoose.model<ISmsTemplateDocument>("SmsTemplate", SmsTemplateSchema);

export default SmsTemplateModel;
