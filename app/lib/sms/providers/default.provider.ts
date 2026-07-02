/**
 * Default SMS provider — logs OTPs to the console.
 *
 * Used in development / test environments when no real provider is configured.
 * The OTP is logged at the WARN level so it's visible in server logs without
 * being persisted or delivered anywhere.
 *
 * DO NOT deploy this as the primary provider in production.
 */

import type {
  ISmsProvider,
  SmsResult,
  BalanceResult,
  HealthResult,
} from "~/lib/sms/interfaces/sms-provider.interface";
import type { SmsProviderType } from "~/types/sms.types";
import { renderTemplate } from "~/lib/templates/sms-template.renderer";

export class DefaultProvider implements ISmsProvider {
  readonly type: SmsProviderType = "default";
  readonly name = "Default (Console)";

  async sendOTP(
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<SmsResult> {
    const start = Date.now();
    const message = renderTemplate(template, { ...variables, otp });

    // In non-test environments, print the OTP so developers can test the flow
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        `[DefaultSMSProvider] OTP for ${to}: ${otp} | Message: "${message}"`
      );
    }

    return {
      success: true,
      messageId: `default-${Date.now()}`,
      provider: this.type,
      latencyMs: Date.now() - start,
    };
  }

  async sendMessage(to: string, message: string): Promise<SmsResult> {
    if (process.env.NODE_ENV !== "test") {
      console.warn(`[DefaultSMSProvider] Message to ${to}: "${message}"`);
    }
    return {
      success: true,
      messageId: `default-msg-${Date.now()}`,
      provider: this.type,
      latencyMs: 0,
    };
  }

  async validate(): Promise<boolean> {
    return true;
  }

  async checkBalance(): Promise<BalanceResult> {
    return { balance: 999999, currency: "USD", unit: "messages", provider: this.type };
  }

  async health(): Promise<HealthResult> {
    return { healthy: true, latencyMs: 0, provider: this.type };
  }
}
