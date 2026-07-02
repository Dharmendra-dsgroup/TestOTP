import { BaseRepository } from "./base.repository";
import SmsProviderModel, { type ISmsProviderDocument } from "~/models/sms-provider.model";
import connectToDatabase from "~/config/database";
import type { SmsProviderRole } from "~/types/sms.types";

export class SmsProviderRepository extends BaseRepository<ISmsProviderDocument> {
  constructor() {
    super(SmsProviderModel);
  }

  async findByShopOrdered(shopDomain: string): Promise<ISmsProviderDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ shopDomain: shopDomain.toLowerCase(), isActive: true })
      .sort({ priority: 1 })
      .exec();
  }

  async findByShopWithCredentials(shopDomain: string): Promise<ISmsProviderDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ shopDomain: shopDomain.toLowerCase() })
      .select("+credentialsEncrypted")
      .sort({ priority: 1 })
      .exec();
  }

  async findByRole(
    shopDomain: string,
    role: SmsProviderRole
  ): Promise<ISmsProviderDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase(), role, isActive: true })
      .select("+credentialsEncrypted")
      .exec();
  }

  async markUnhealthy(
    id: string,
    errorMessage: string
  ): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { _id: id },
        {
          $set: {
            isHealthy: false,
            lastErrorAt: new Date(),
            lastErrorMessage: errorMessage,
          },
        }
      )
      .exec();
  }

  async markHealthy(id: string): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { _id: id },
        { $set: { isHealthy: true, lastHealthCheckAt: new Date() } }
      )
      .exec();
  }

  async incrementSentCount(id: string): Promise<void> {
    await connectToDatabase();
    await this.model.updateOne({ _id: id }, { $inc: { totalSent: 1 } }).exec();
  }

  async incrementFailedCount(id: string): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne({ _id: id }, { $inc: { totalFailed: 1 } })
      .exec();
  }
}

export const smsProviderRepository = new SmsProviderRepository();
