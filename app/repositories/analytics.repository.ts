import { BaseRepository } from "./base.repository";
import AnalyticsModel, { type IAnalyticsDocument } from "~/models/analytics.model";
import connectToDatabase from "~/config/database";
import type { AnalyticsPeriod, AnalyticsIncrementFields } from "~/types/analytics.types";

export class AnalyticsRepository extends BaseRepository<IAnalyticsDocument> {
  constructor() {
    super(AnalyticsModel);
  }

  async upsertRecord(
    shopDomain: string,
    period: AnalyticsPeriod,
    periodKey: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<IAnalyticsDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase(), period, periodKey },
        {
          $setOnInsert: {
            shopDomain: shopDomain.toLowerCase(),
            period,
            periodKey,
            periodStart,
            periodEnd,
          },
        },
        { new: true, upsert: true }
      )
      .exec();
    if (!doc) throw new Error("Failed to upsert analytics record");
    return doc;
  }

  async incrementCounters(
    shopDomain: string,
    period: AnalyticsPeriod,
    periodKey: string,
    fields: AnalyticsIncrementFields
  ): Promise<void> {
    await connectToDatabase();
    const inc: Record<string, number> = {};
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) inc[key] = val;
    }
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase(), period, periodKey },
        { $inc: inc }
      )
      .exec();
  }

  async incrementCountryCount(
    shopDomain: string,
    period: AnalyticsPeriod,
    periodKey: string,
    countryCode: string
  ): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase(), period, periodKey },
        { $inc: { [`byCountry.${countryCode}`]: 1 } }
      )
      .exec();
  }

  async findForPeriod(
    shopDomain: string,
    period: AnalyticsPeriod,
    from: Date,
    to: Date
  ): Promise<IAnalyticsDocument[]> {
    await connectToDatabase();
    return this.model
      .find({
        shopDomain: shopDomain.toLowerCase(),
        period,
        periodStart: { $gte: from },
        periodEnd: { $lte: to },
      })
      .sort({ periodStart: 1 })
      .exec();
  }
}

export const analyticsRepository = new AnalyticsRepository();
