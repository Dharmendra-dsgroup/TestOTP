import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { ISession, IOnlineAccessInfo } from "~/types/session.types";

export interface ISessionDocument
  extends Omit<ISession, "id" | "onlineAccessInfo">,
    Document {
  _id: string;
  onlineAccessInfo?: IOnlineAccessInfo;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accountOwner?: boolean;
  locale?: string;
  collaborator?: boolean;
  emailVerified?: boolean;
}

const OnlineAccessUserSchema = new Schema(
  {
    id: { type: Number },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    emailVerified: { type: Boolean },
    accountOwner: { type: Boolean },
    locale: { type: String },
    collaborator: { type: Boolean },
  },
  { _id: false }
);

const OnlineAccessInfoSchema = new Schema<IOnlineAccessInfo>(
  {
    expiresIn: { type: Number },
    associatedUserScope: { type: String },
    associatedUser: { type: OnlineAccessUserSchema },
  },
  { _id: false }
);

const SessionSchema = new Schema<ISessionDocument>(
  {
    _id: { type: String, required: true },
    shop: {
      type: String,
      required: true,
      index: true,
      lowercase: true,
    },
    state: { type: String, required: true },
    isOnline: { type: Boolean, required: true, default: false },
    scope: { type: String },
    expires: { type: Date },
    accessToken: { type: String, select: false },
    onlineAccessInfo: { type: OnlineAccessInfoSchema },
    userId: { type: String, index: true, sparse: true },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    accountOwner: { type: Boolean },
    locale: { type: String },
    collaborator: { type: Boolean },
    emailVerified: { type: Boolean },
  },
  {
    timestamps: true,
    collection: "sessions",
    _id: false,
  }
);

// TTL index — MongoDB auto-removes expired sessions
SessionSchema.index(
  { expires: 1 },
  { expireAfterSeconds: 0, sparse: true }
);

SessionSchema.index({ shop: 1, isOnline: 1 });
SessionSchema.index({ createdAt: 1 });

export const SessionModel: Model<ISessionDocument> =
  (mongoose.models.Session as Model<ISessionDocument>) ??
  mongoose.model<ISessionDocument>("Session", SessionSchema);

export default SessionModel;
