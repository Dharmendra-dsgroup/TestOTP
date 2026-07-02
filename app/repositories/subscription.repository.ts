import { BaseRepository } from "./base.repository";
import SubscriptionModel, {
  type ISubscriptionDocument,
} from "~/models/subscription.model";
import connectToDatabase from "~/config/database";
import type { SubscriptionStatus, SubscriptionCreateInput } from "~/types/billing.types";

export class SubscriptionRepository extends BaseRepository<ISubscriptionDocument> {
  constructor() {
    super(SubscriptionModel);
  }

  /** Returns the most recent subscription record for a shop. */
  async findLatestByShop(
    shopDomain: string
  ): Promise<ISubscriptionDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase() })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Returns the current active (or trial) subscription for a shop. */
  async findActiveByShop(
    shopDomain: string
  ): Promise<ISubscriptionDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({
        shopDomain: shopDomain.toLowerCase(),
        status: { $in: ["active", "trial"] },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByShopifyId(
    shopifySubscriptionId: string
  ): Promise<ISubscriptionDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopifySubscriptionId })
      .exec();
  }

  async createSubscription(
    input: SubscriptionCreateInput
  ): Promise<ISubscriptionDocument> {
    await connectToDatabase();
    const doc = new this.model({
      ...input,
      shopDomain: input.shopDomain.toLowerCase(),
    });
    return doc.save();
  }

  async updateByShopifyId(
    shopifySubscriptionId: string,
    update: Partial<
      Pick<
        ISubscriptionDocument,
        | "status"
        | "shopifyStatus"
        | "activatedAt"
        | "cancelledAt"
        | "currentPeriodStart"
        | "currentPeriodEnd"
        | "trialEndsAt"
      >
    >
  ): Promise<ISubscriptionDocument | null> {
    await connectToDatabase();
    return this.model
      .findOneAndUpdate(
        { shopifySubscriptionId },
        { $set: update },
        { new: true }
      )
      .exec();
  }

  /** Cancel all active subscriptions for a shop (used during uninstall). */
  async cancelAllForShop(shopDomain: string): Promise<void> {
    await connectToDatabase();
    await this.model.updateMany(
      {
        shopDomain: shopDomain.toLowerCase(),
        status: { $in: ["active", "trial", "pending"] },
      },
      {
        $set: {
          status: "cancelled" as SubscriptionStatus,
          cancelledAt: new Date(),
        },
      }
    );
  }

  /** Returns all subscription history for a shop, newest first. */
  async historyByShop(
    shopDomain: string,
    limit = 10
  ): Promise<ISubscriptionDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ shopDomain: shopDomain.toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}

export const subscriptionRepository = new SubscriptionRepository();
