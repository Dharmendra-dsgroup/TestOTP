import { BaseRepository } from "./base.repository";
import MerchantSettingsModel, { type IMerchantSettingsDocument } from "~/models/merchant-settings.model";
import connectToDatabase from "~/config/database";

export class MerchantSettingsRepository extends BaseRepository<IMerchantSettingsDocument> {
  constructor() {
    super(MerchantSettingsModel);
  }

  async findByShop(shopDomain: string): Promise<IMerchantSettingsDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase() })
      .exec();
  }

  async findByShopWithSecrets(
    shopDomain: string
  ): Promise<IMerchantSettingsDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase() })
      .select("+notificationPreferences.webhookSecret")
      .exec();
  }

  async upsertForShop(
    shopDomain: string,
    data: Partial<IMerchantSettingsDocument>
  ): Promise<IMerchantSettingsDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase() },
        { $set: { ...data, shopDomain: shopDomain.toLowerCase() } },
        { new: true, upsert: true, runValidators: true }
      )
      .exec();
    if (!doc) throw new Error(`Failed to upsert settings for: ${shopDomain}`);
    return doc;
  }

  async markOnboardingComplete(shopDomain: string): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase() },
        { $set: { onboardingCompleted: true } }
      )
      .exec();
  }

  async advanceOnboardingStep(shopDomain: string, step: number): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase() },
        { $set: { onboardingStep: step } }
      )
      .exec();
  }
}

export const merchantSettingsRepository = new MerchantSettingsRepository();
