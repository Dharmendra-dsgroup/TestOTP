export type AuditAction =
  | "otp.requested"
  | "otp.sent"
  | "otp.verified"
  | "otp.failed"
  | "otp.expired"
  | "otp.blocked"
  | "otp.resent"
  | "customer.created"
  | "customer.login"
  | "customer.registered"
  | "customer.blocked"
  | "customer.unblocked"
  | "shop.installed"
  | "shop.uninstalled"
  | "shop.reactivated"
  | "settings.updated"
  | "provider.added"
  | "provider.updated"
  | "provider.removed"
  | "provider.failover"
  | "template.created"
  | "template.updated"
  | "template.deleted"
  | "billing.trial_started"
  | "billing.upgraded"
  | "billing.downgraded"
  | "billing.cancelled"
  | "billing.payment_failed"
  | "security.ip_blocked"
  | "security.ip_unblocked"
  | "security.phone_blocked"
  | "security.phone_unblocked"
  | "security.rate_limited"
  | "security.fraud_detected"
  | "gdpr.data_request"
  | "gdpr.customer_redact"
  | "gdpr.shop_redact";

export type AuditActorType = "shop" | "customer" | "system" | "webhook" | "admin";
export type AuditResult = "success" | "failure" | "blocked";

export interface IAuditLog {
  shopDomain: string;
  action: AuditAction;
  actorType: AuditActorType;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  result: AuditResult;
  errorMessage?: string;
  durationMs?: number;
  createdAt: Date;
}

export type AuditLogCreateInput = Omit<IAuditLog, "createdAt">;
