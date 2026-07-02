import { BaseRepository } from "./base.repository";
import OtpLogModel, { type IOtpLogDocument } from "~/models/otp-log.model";
import connectToDatabase from "~/config/database";
import type { OTP_STATUS } from "~/types/otp.types";

export class OtpLogRepository extends BaseRepository<IOtpLogDocument> {
  constructor() {
    super(OtpLogModel);
  }

  async findByRequestId(requestId: string): Promise<IOtpLogDocument | null> {
    await connectToDatabase();
    return this.model.findOne({ requestId }).exec();
  }

  async updateStatus(
    requestId: string,
    status: OTP_STATUS,
    extra?: Partial<IOtpLogDocument>
  ): Promise<IOtpLogDocument | null> {
    await connectToDatabase();
    const setData: Record<string, unknown> = { status, ...extra };

    if (status === "sent") setData.sentAt = new Date();
    if (status === "verified") setData.verifiedAt = new Date();
    if (status === "failed" || status === "blocked") setData.failedAt = new Date();

    return this.model
      .findOneAndUpdate(
        { requestId },
        { $set: setData },
        { new: true }
      )
      .exec();
  }

  async incrementAttempts(requestId: string): Promise<IOtpLogDocument | null> {
    await connectToDatabase();
    return this.model
      .findOneAndUpdate(
        { requestId },
        { $inc: { attempts: 1 } },
        { new: true }
      )
      .exec();
  }

  async countByPhoneInWindow(
    shopDomain: string,
    phone: string,
    windowMs: number
  ): Promise<number> {
    await connectToDatabase();
    const since = new Date(Date.now() - windowMs);
    return this.model
      .countDocuments({ shopDomain: shopDomain.toLowerCase(), phone, createdAt: { $gte: since } })
      .exec();
  }

  async countByIpInWindow(
    shopDomain: string,
    ipAddress: string,
    windowMs: number
  ): Promise<number> {
    await connectToDatabase();
    const since = new Date(Date.now() - windowMs);
    return this.model
      .countDocuments({ shopDomain: shopDomain.toLowerCase(), ipAddress, createdAt: { $gte: since } })
      .exec();
  }

  async findRecentByShop(
    shopDomain: string,
    limit = 50
  ): Promise<IOtpLogDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ shopDomain: shopDomain.toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}

export const otpLogRepository = new OtpLogRepository();
