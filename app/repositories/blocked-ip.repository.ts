import { BaseRepository } from "./base.repository";
import BlockedIpModel, { type IBlockedIpDocument, type BlockReason } from "~/models/blocked-ip.model";
import connectToDatabase from "~/config/database";

export class BlockedIpRepository extends BaseRepository<IBlockedIpDocument> {
  constructor() {
    super(BlockedIpModel);
  }

  async isBlocked(shopDomain: string, ipAddress: string): Promise<boolean> {
    await connectToDatabase();
    const result = await this.model
      .exists({
        ipAddress,
        $or: [
          { shopDomain: shopDomain.toLowerCase() },
          { isGlobal: true },
        ],
      })
      .exec();
    return result !== null;
  }

  async blockIp(
    shopDomain: string,
    ipAddress: string,
    reason: BlockReason,
    blockedBy: "auto" | "manual",
    expiresAt?: Date,
    isGlobal = false
  ): Promise<IBlockedIpDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { ipAddress, shopDomain: isGlobal ? null : shopDomain.toLowerCase() },
        {
          $set: {
            ipAddress,
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
    if (!doc) throw new Error(`Failed to block IP: ${ipAddress}`);
    return doc;
  }

  async unblockIp(shopDomain: string, ipAddress: string): Promise<boolean> {
    await connectToDatabase();
    const result = await this.model
      .deleteOne({ ipAddress, shopDomain: shopDomain.toLowerCase() })
      .exec();
    return result.deletedCount > 0;
  }

  async findByShop(shopDomain: string): Promise<IBlockedIpDocument[]> {
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

export const blockedIpRepository = new BlockedIpRepository();
