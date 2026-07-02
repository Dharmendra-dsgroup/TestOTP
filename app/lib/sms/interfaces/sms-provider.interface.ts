import type { SmsProviderType } from "~/types/sms.types";

/**
 * Result of a single SMS send attempt.
 */
export interface SmsResult {
  success: boolean;
  messageId?: string;
  cost?: number;
  errorCode?: string;
  errorMessage?: string;
  provider: SmsProviderType;
  /** Round-trip latency in milliseconds. */
  latencyMs?: number;
}

/**
 * Provider account balance information.
 */
export interface BalanceResult {
  balance: number;
  currency: string;
  unit?: string;
  provider: SmsProviderType;
}

/**
 * Result of a health check ping.
 */
export interface HealthResult {
  healthy: boolean;
  latencyMs: number;
  provider: SmsProviderType;
  errorMessage?: string;
}

/**
 * Core interface every SMS provider must implement.
 *
 * - sendOTP   — renders the template with variables and sends
 * - sendMessage — sends an arbitrary pre-rendered message
 * - validate  — validates stored credentials (async ping)
 * - checkBalance — returns account credit balance
 * - health    — lightweight connectivity check
 *
 * Implementations MUST NOT throw. All errors are returned via the result type.
 */
export interface ISmsProvider {
  readonly type: SmsProviderType;
  readonly name: string;

  sendOTP(
    to: string,
    otp: string,
    template: string,
    variables?: Record<string, string>
  ): Promise<SmsResult>;

  sendMessage(to: string, message: string): Promise<SmsResult>;

  validate(): Promise<boolean>;

  checkBalance(): Promise<BalanceResult>;

  health(): Promise<HealthResult>;
}
