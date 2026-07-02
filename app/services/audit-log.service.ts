import { auditLogRepository } from "~/repositories/audit-log.repository";
import type { IAuditLogDocument } from "~/models/audit-log.model";
import type { AuditLogCreateInput, AuditAction, AuditResult } from "~/types/audit.types";
import type { PaginationQuery, ServiceResult } from "~/types/common.types";
import { serviceSuccess, serviceFailure } from "~/types/common.types";

export class AuditLogService {
  /**
   * Creates an audit log entry. This is fire-and-forget — never throw.
   * Failures are logged to console but don't affect the calling operation.
   */
  async log(data: AuditLogCreateInput): Promise<void> {
    try {
      await auditLogRepository.createLog(data);
    } catch (error) {
      // Audit log failures must never break the main operation
      console.error("[AuditLogService] Failed to create audit log:", error);
    }
  }

  /**
   * Convenience wrapper to log with minimal boilerplate.
   */
  async logAction(
    shopDomain: string,
    action: AuditAction,
    result: AuditResult,
    options: {
      actorType?: AuditLogCreateInput["actorType"];
      actorId?: string;
      targetType?: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
      ipAddress?: string;
      userAgent?: string;
      errorMessage?: string;
      durationMs?: number;
    } = {}
  ): Promise<void> {
    await this.log({
      shopDomain,
      action,
      result,
      actorType: options.actorType ?? "system",
      actorId: options.actorId,
      targetType: options.targetType,
      targetId: options.targetId,
      metadata: options.metadata ?? {},
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      errorMessage: options.errorMessage,
      durationMs: options.durationMs,
    });
  }

  async getLogsForShop(
    shopDomain: string,
    options: PaginationQuery & { action?: AuditAction; from?: Date; to?: Date } = {}
  ): Promise<ServiceResult<{ data: IAuditLogDocument[]; total: number }>> {
    try {
      const result = await auditLogRepository.findByShop(shopDomain, options);
      return serviceSuccess(result);
    } catch (error) {
      console.error("[AuditLogService] getLogsForShop failed:", error);
      return serviceFailure("Failed to retrieve audit logs", 500);
    }
  }

  async getSecurityEvents(
    shopDomain: string,
    limit = 20
  ): Promise<ServiceResult<IAuditLogDocument[]>> {
    try {
      const events = await auditLogRepository.findSecurityEvents(shopDomain, limit);
      return serviceSuccess(events);
    } catch (error) {
      console.error("[AuditLogService] getSecurityEvents failed:", error);
      return serviceFailure("Failed to retrieve security events", 500);
    }
  }
}

export const auditLogService = new AuditLogService();
