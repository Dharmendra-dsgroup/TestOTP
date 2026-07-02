import { BaseRepository } from "./base.repository";
import OtpAttemptModel, { type IOtpAttemptDocument } from "~/models/otp-attempt.model";
import connectToDatabase from "~/config/database";
import type mongoose from "mongoose";

export class OtpAttemptRepository extends BaseRepository<IOtpAttemptDocument> {
  constructor() {
    super(OtpAttemptModel);
  }

  async countFailedByIpInWindow(
    ipAddress: string,
    windowMs: number
  ): Promise<number> {
    await connectToDatabase();
    const since = new Date(Date.now() - windowMs);
    return this.model
      .countDocuments({
        ipAddress,
        result: "failure",
        createdAt: { $gte: since },
      })
      .exec();
  }

  async countByOtpLogId(
    otpLogId: mongoose.Types.ObjectId
  ): Promise<number> {
    await connectToDatabase();
    return this.model.countDocuments({ otpLogId }).exec();
  }

  async findByOtpLogId(
    otpLogId: mongoose.Types.ObjectId
  ): Promise<IOtpAttemptDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ otpLogId })
      .sort({ createdAt: 1 })
      .exec();
  }
}

export const otpAttemptRepository = new OtpAttemptRepository();
