import mongoose, { Schema, type Document, type Model } from "mongoose";
import type {
  ISecurityEvent,
  SecurityEventType,
  SecurityEventSeverity,
} from "~/types/security.types";

export interface ISecurityEventDocument
  extends Omit<ISecurityEvent, "_id">,
    Document {
  _id: mongoose.Types.ObjectId;
}

const SecurityEventSchema = new Schema<ISecurityEventDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "ip_blocked",
        "phone_blocked",
        "country_blocked",
        "email_domain_blocked",
        "ip_velocity_exceeded",
        "phone_velocity_exceeded",
        "auto_blocked_ip",
        "auto_blocked_phone",
        "rate_limited",
        "suspicious_pattern",
      ] as SecurityEventType[],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ["low", "medium", "high", "critical"] as SecurityEventSeverity[],
      index: true,
    },
    recipientMasked: { type: String },
    recipientType: {
      type: String,
      enum: ["phone", "email"],
    },
    ipAddress: { type: String, index: true },
    country: { type: String, uppercase: true },
    signal: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: "securityEvents",
  }
);

// Query patterns: by shop, by type, by time range
SecurityEventSchema.index({ shopDomain: 1, createdAt: -1 });
SecurityEventSchema.index({ shopDomain: 1, type: 1, createdAt: -1 });
SecurityEventSchema.index({ shopDomain: 1, severity: 1, createdAt: -1 });
SecurityEventSchema.index({ shopDomain: 1, ipAddress: 1, createdAt: -1 });

// Auto-expire security events after 90 days
SecurityEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 3600 }
);

export const SecurityEventModel: Model<ISecurityEventDocument> =
  (mongoose.models.SecurityEvent as Model<ISecurityEventDocument>) ??
  mongoose.model<ISecurityEventDocument>(
    "SecurityEvent",
    SecurityEventSchema
  );

export default SecurityEventModel;
