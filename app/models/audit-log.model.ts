import mongoose, { Schema, type Document, type Model } from "mongoose";
import type {
  IAuditLog,
  AuditAction,
  AuditActorType,
  AuditResult,
} from "~/types/audit.types";

export interface IAuditLogDocument
  extends Omit<IAuditLog, "createdAt">,
    Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    shopDomain: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ["shop", "customer", "system", "webhook", "admin"],
      required: true,
    },
    actorId: { type: String, index: true, sparse: true },
    targetType: { type: String },
    targetId: { type: String, index: true, sparse: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
    userAgent: { type: String },
    result: {
      type: String,
      enum: ["success", "failure", "blocked"],
      required: true,
      index: true,
    },
    errorMessage: { type: String },
    durationMs: { type: Number },
  },
  {
    // Audit logs are append-only — no updatedAt
    timestamps: { createdAt: true, updatedAt: false },
    collection: "auditLogs",
  }
);

AuditLogSchema.index({ shopDomain: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ shopDomain: 1, result: 1, createdAt: -1 });
AuditLogSchema.index({ shopDomain: 1, actorId: 1, createdAt: -1 }, { sparse: true });
AuditLogSchema.index({ ipAddress: 1, createdAt: -1 }, { sparse: true });

// TTL: auto-delete after 90 days
AuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

export const AuditLogModel: Model<IAuditLogDocument> =
  (mongoose.models.AuditLog as Model<IAuditLogDocument>) ??
  mongoose.model<IAuditLogDocument>("AuditLog", AuditLogSchema);

export default AuditLogModel;
