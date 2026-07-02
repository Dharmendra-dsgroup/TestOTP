/**
 * Security & Fraud Detection type definitions.
 */

import type { TimestampFields } from "./common.types";

// ─── Security Event ───────────────────────────────────────────────────────────

export type SecurityEventType =
  | "ip_blocked"
  | "phone_blocked"
  | "country_blocked"
  | "email_domain_blocked"
  | "ip_velocity_exceeded"
  | "phone_velocity_exceeded"
  | "auto_blocked_ip"
  | "auto_blocked_phone"
  | "rate_limited"
  | "suspicious_pattern";

export type SecurityEventSeverity = "low" | "medium" | "high" | "critical";

export interface ISecurityEvent extends TimestampFields {
  shopDomain: string;
  type: SecurityEventType;
  severity: SecurityEventSeverity;
  /** Masked phone/email for display (e.g. "+1****1234") */
  recipientMasked?: string;
  recipientType?: "phone" | "email";
  /** Raw IP stored for management purposes */
  ipAddress?: string;
  country?: string;
  signal: string;
  /** Optional structured payload for debugging (no raw PII) */
  metadata?: Record<string, unknown>;
}

// ─── Fraud Evaluation ─────────────────────────────────────────────────────────

export interface FraudEvaluateInput {
  phone?: string;
  email?: string;
  ipAddress: string;
  country?: string;
  channel?: string;
}

export interface FraudDecision {
  allowed: boolean;
  reason?: string;
  signal?: SecurityEventType;
  severity?: SecurityEventSeverity;
  /** Auto-block was triggered during this evaluation */
  autoBlocked?: boolean;
}

// ─── Velocity State (internal, not stored) ───────────────────────────────────

export interface VelocityState {
  count: number;
  windowSeconds: number;
  exceeded: boolean;
}
