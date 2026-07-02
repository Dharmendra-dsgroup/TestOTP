import { BaseRepository } from "./base.repository";
import SecurityEventModel, {
  type ISecurityEventDocument,
} from "~/models/security-event.model";
import connectToDatabase from "~/config/database";
import type { SecurityEventType, SecurityEventSeverity } from "~/types/security.types";

export interface SecurityEventFilter {
  type?: SecurityEventType;
  severity?: SecurityEventSeverity;
  since?: Date;
  limit?: number;
  skip?: number;
}

export interface SecurityEventSummary {
  type: SecurityEventType;
  count: number;
}

export class SecurityEventRepository extends BaseRepository<ISecurityEventDocument> {
  constructor() {
    super(SecurityEventModel);
  }

  async create(
    shopDomain: string,
    event: Omit<ISecurityEventDocument, "_id" | "shopDomain" | "createdAt" | "updatedAt">
  ): Promise<ISecurityEventDocument> {
    await connectToDatabase();
    return this.model.create({ ...event, shopDomain: shopDomain.toLowerCase() });
  }

  async findByShop(
    shopDomain: string,
    filter: SecurityEventFilter = {}
  ): Promise<ISecurityEventDocument[]> {
    await connectToDatabase();
    const query: Record<string, unknown> = {
      shopDomain: shopDomain.toLowerCase(),
    };
    if (filter.type) query.type = filter.type;
    if (filter.severity) query.severity = filter.severity;
    if (filter.since) query.createdAt = { $gte: filter.since };

    return this.model
      .find(query)
      .sort({ createdAt: -1 })
      .skip(filter.skip ?? 0)
      .limit(filter.limit ?? 50)
      .exec();
  }

  async countByShop(shopDomain: string, since?: Date): Promise<number> {
    await connectToDatabase();
    const query: Record<string, unknown> = {
      shopDomain: shopDomain.toLowerCase(),
    };
    if (since) query.createdAt = { $gte: since };
    return this.model.countDocuments(query).exec();
  }

  async countByShopAndType(
    shopDomain: string,
    type: SecurityEventType,
    since?: Date
  ): Promise<number> {
    await connectToDatabase();
    const query: Record<string, unknown> = {
      shopDomain: shopDomain.toLowerCase(),
      type,
    };
    if (since) query.createdAt = { $gte: since };
    return this.model.countDocuments(query).exec();
  }

  /** Returns event counts grouped by type for the past N days. */
  async summarizeByType(
    shopDomain: string,
    since: Date
  ): Promise<SecurityEventSummary[]> {
    await connectToDatabase();
    const rows = await this.model
      .aggregate<{ _id: SecurityEventType; count: number }>([
        {
          $match: {
            shopDomain: shopDomain.toLowerCase(),
            createdAt: { $gte: since },
          },
        },
        {
          $group: { _id: "$type", count: { $sum: 1 } },
        },
        { $sort: { count: -1 } },
      ])
      .exec();

    return rows.map((r) => ({ type: r._id, count: r.count }));
  }

  /** Returns recent distinct IPs that triggered security events. */
  async recentBlockedIps(
    shopDomain: string,
    since: Date,
    limit = 10
  ): Promise<string[]> {
    await connectToDatabase();
    const results = await this.model
      .distinct("ipAddress", {
        shopDomain: shopDomain.toLowerCase(),
        ipAddress: { $exists: true, $ne: null },
        createdAt: { $gte: since },
      })
      .exec();
    return (results as string[]).slice(0, limit);
  }
}

export const securityEventRepository = new SecurityEventRepository();
