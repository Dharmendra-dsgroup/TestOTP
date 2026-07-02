import { BaseRepository } from "./base.repository";
import ShopModel, { type IShopDocument } from "~/models/shop.model";
import connectToDatabase from "~/config/database";
import type { ShopCreateInput } from "~/types/shop.types";

export class ShopRepository extends BaseRepository<IShopDocument> {
  constructor() {
    super(ShopModel);
  }

  async findByDomain(shopDomain: string): Promise<IShopDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase() })
      .exec();
  }

  async findByDomainWithToken(
    shopDomain: string
  ): Promise<IShopDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase() })
      .select("+accessToken")
      .exec();
  }

  async findByShopId(shopId: string): Promise<IShopDocument | null> {
    await connectToDatabase();
    return this.model.findOne({ shopId }).exec();
  }

  async upsertByDomain(
    shopDomain: string,
    data: ShopCreateInput
  ): Promise<IShopDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase() },
        {
          $set: {
            ...data,
            shopDomain: shopDomain.toLowerCase(),
            isInstalled: true,
            isActive: true,
          },
          $setOnInsert: {
            installedAt: new Date(),
          },
        },
        { new: true, upsert: true, runValidators: true }
      )
      .exec();

    if (!doc) {
      throw new Error(
        `Failed to upsert shop: ${shopDomain}`
      );
    }
    return doc;
  }

  async markUninstalled(shopDomain: string): Promise<IShopDocument | null> {
    await connectToDatabase();
    return this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase() },
        {
          $set: {
            isInstalled: false,
            isActive: false,
            uninstalledAt: new Date(),
          },
        },
        { new: true }
      )
      .exec();
  }

  async updateSettings(
    shopDomain: string,
    settings: Partial<IShopDocument["settings"]>
  ): Promise<IShopDocument | null> {
    await connectToDatabase();

    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(settings)) {
      updateData[`settings.${key}`] = value;
    }

    return this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase() },
        { $set: updateData },
        { new: true, runValidators: true }
      )
      .exec();
  }

  async updateBilling(
    shopDomain: string,
    billing: Partial<IShopDocument["billing"]>
  ): Promise<IShopDocument | null> {
    await connectToDatabase();

    const setData: Record<string, unknown> = {};
    const unsetData: Record<string, 1> = {};

    for (const [key, value] of Object.entries(billing)) {
      if (value === undefined) {
        unsetData[`billing.${key}`] = 1;
      } else {
        setData[`billing.${key}`] = value;
      }
    }

    const updateOp: Record<string, unknown> = {};
    if (Object.keys(setData).length > 0) updateOp["$set"] = setData;
    if (Object.keys(unsetData).length > 0) updateOp["$unset"] = unsetData;

    if (Object.keys(updateOp).length === 0) return null;

    return this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase() },
        updateOp,
        { new: true, runValidators: true }
      )
      .exec();
  }

  async incrementOtpUsage(shopDomain: string): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase() },
        { $inc: { "billing.otpUsedThisPeriod": 1 } }
      )
      .exec();
  }

  async findActiveShops(): Promise<IShopDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ isInstalled: true, isActive: true })
      .exec();
  }
}

export const shopRepository = new ShopRepository();
