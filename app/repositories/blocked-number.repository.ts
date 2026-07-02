import { BaseRepository } from "./base.repository";
import BlockedNumberModel, { type IBlockedNumberDocument } from "~/models/blocked-number.model";
import connectToDatabase from "~/config/database";
import type { BlockReason } from "~/models/blocked-ip.model";

export class BlockedNumberRepository extends BaseRepository<IBlockedNumberDocument> {
  constructor() {
    super(BlockedNumberModel);
  }

  async isBlocked(shopDomain: string, phone: string): Promise<boolean> {
    await connectToDatabase();
    const result = await this.model
      .exists({
        phone,
        $or: [
          { shopDomain: shopDomain.toLowerCase() },
          { isGlobal: true },
        ],
      })
      .exec();
    return result !== null;
  }

  async blockNumber(
    shopDomain: string,
    phone: string,
    reason: BlockReason,
    blockedBy: "auto" | "manual",
    expiresAt?: Date,
    isGlobal = false
  ): Promise<IBlockedNumberDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { phone, shopDomain: isGlobal ? null : shopDomain.toLowerCase() },
        {
          $set: {
            phone,
            shopDomain: isGlobal ? undefined : shopDomain.toLowerCase(),
            reason,
            blockedBy,
            expiresAt,
            isGlobal,
          },
        },
        { new: true, upsert: true }
      )
      .exec();
    if (!doc) throw new Error(`Failed to block number: ${phone}`);
    return doc;
  }

  async unblockNumber(shopDomain: string, phone: string): Promise<boolean> {
    await connectToDatabase();
    const result = await this.model
      .deleteOne({ phone, shopDomain: shopDomain.toLowerCase() })
      .exec();
    return result.deletedCount > 0;
  }

  async findByShop(shopDomain: string): Promise<IBlockedNumberDocument[]> {
    await connectToDatabase();
    return this.model
      .find({
        $or: [
          { shopDomain: shopDomain.toLowerCase() },
          { isGlobal: true },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();
  }
}

export const blockedNumberRepository = new BlockedNumberRepository();
