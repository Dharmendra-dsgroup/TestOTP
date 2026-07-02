import { BaseRepository } from "./base.repository";
import AuditLogModel, { type IAuditLogDocument } from "~/models/audit-log.model";
import connectToDatabase from "~/config/database";
import type { AuditAction, AuditLogCreateInput } from "~/types/audit.types";
import type { PaginationQuery } from "~/types/common.types";

export class AuditLogRepository extends BaseRepository<IAuditLogDocument> {
  constructor() {
    super(AuditLogModel);
  }

  async createLog(data: AuditLogCreateInput): Promise<IAuditLogDocument> {
    await connectToDatabase();
    return this.model.create(data);
  }

  async findByShop(
    shopDomain: string,
    options: PaginationQuery & { action?: AuditAction; from?: Date; to?: Date } = {}
  ): Promise<{ data: IAuditLogDocument[]; total: number }> {
    await connectToDatabase();

    const filter: Record<string, unknown> = {
      shopDomain: shopDomain.toLowerCase(),
    };
    if (options.action) filter.action = options.action;
    if (options.from || options.to) {
      filter.createdAt = {};
      if (options.from) (filter.createdAt as Record<string, Date>).$gte = options.from;
      if (options.to) (filter.createdAt as Record<string, Date>).$lte = options.to;
    }

    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, options.limit ?? 20);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { data, total };
  }

  async findSecurityEvents(
    shopDomain: string,
    limit = 20
  ): Promise<IAuditLogDocument[]> {
    await connectToDatabase();
    return this.model
      .find({
        shopDomain: shopDomain.toLowerCase(),
        action: {
          $in: [
            "security.ip_blocked",
            "security.phone_blocked",
            "security.rate_limited",
            "security.fraud_detected",
          ],
        },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}

export const auditLogRepository = new AuditLogRepository();
