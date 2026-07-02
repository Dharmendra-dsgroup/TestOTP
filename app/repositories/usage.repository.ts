import { BaseRepository } from "./base.repository";
import UsageModel, { type IUsageDocument } from "~/models/usage.model";
import connectToDatabase from "~/config/database";
import type { PlanId } from "~/types/billing.types";

export class UsageRepository extends BaseRepository<IUsageDocument> {
  constructor() {
    super(UsageModel);
  }

  async findOrCreateForPeriod(
    shopDomain: string,
    periodKey: string,
    planId: PlanId,
    periodStart: Date,
    periodEnd: Date
  ): Promise<IUsageDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase(), periodKey },
        {
          $setOnInsert: {
            shopDomain: shopDomain.toLowerCase(),
            periodKey,
            planId,
            periodStart,
            periodEnd,
          },
        },
        { new: true, upsert: true }
      )
      .exec();
    if (!doc) throw new Error(`Failed to get usage for period: ${periodKey}`);
    return doc;
  }

  async incrementField(
    shopDomain: string,
    periodKey: string,
    field: keyof Pick<
      IUsageDocument,
      "otpSent" | "otpVerified" | "smsSent" | "emailSent" | "whatsappSent" | "voiceSent" | "apiCalls"
    >,
    amount = 1
  ): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase(), periodKey },
        { $inc: { [field]: amount } }
      )
      .exec();
  }

  async getCurrentPeriodUsage(
    shopDomain: string
  ): Promise<IUsageDocument | null> {
    await connectToDatabase();
    const now = new Date();
    return this.model
      .findOne({
        shopDomain: shopDomain.toLowerCase(),
        periodStart: { $lte: now },
        periodEnd: { $gte: now },
      })
      .exec();
  }
}

export const usageRepository = new UsageRepository();
