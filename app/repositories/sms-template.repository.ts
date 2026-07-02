import { BaseRepository } from "./base.repository";
import SmsTemplateModel, { type ISmsTemplateDocument } from "~/models/sms-template.model";
import connectToDatabase from "~/config/database";
import type { SmsTemplateType } from "~/types/sms.types";

export class SmsTemplateRepository extends BaseRepository<ISmsTemplateDocument> {
  constructor() {
    super(SmsTemplateModel);
  }

  async findDefault(
    shopDomain: string,
    type: SmsTemplateType,
    language = "en"
  ): Promise<ISmsTemplateDocument | null> {
    await connectToDatabase();
    // Try exact language match first, fall back to English
    const template = await this.model
      .findOne({
        shopDomain: shopDomain.toLowerCase(),
        type,
        language,
        isDefault: true,
        isActive: true,
      })
      .exec();

    if (template || language === "en") return template;

    return this.model
      .findOne({
        shopDomain: shopDomain.toLowerCase(),
        type,
        language: "en",
        isDefault: true,
        isActive: true,
      })
      .exec();
  }

  async findByShopAndType(
    shopDomain: string,
    type: SmsTemplateType
  ): Promise<ISmsTemplateDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ shopDomain: shopDomain.toLowerCase(), type, isActive: true })
      .sort({ isDefault: -1, language: 1 })
      .exec();
  }

  async setAsDefault(id: string, type: SmsTemplateType, shopDomain: string): Promise<void> {
    await connectToDatabase();
    // Remove default flag from other templates of same type
    await this.model
      .updateMany(
        { shopDomain: shopDomain.toLowerCase(), type, _id: { $ne: id } },
        { $set: { isDefault: false } }
      )
      .exec();
    // Set new default
    await this.model.updateOne({ _id: id }, { $set: { isDefault: true } }).exec();
  }
}

export const smsTemplateRepository = new SmsTemplateRepository();
