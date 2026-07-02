/**
 * MSG91 SMS provider.
 *
 * Uses the MSG91 OTP v5 API for sending OTPs.
 * Docs: https://msg91.com/help/api/send-otp
 *
 * Required credentials:
 *   apiKey       — authkey from MSG91 dashboard
 *   senderId     — DLT-registered sender ID (e.g. "OTPPIN")
 *   templateId   — DLT-registered template ID (passed as `template_id`)
 */

import type {
  ISmsProvider,
  SmsResult,
  BalanceResult,
  HealthResult,
} from "~/lib/sms/interfaces/sms-provider.interface";
import type { SmsProviderType, SmsProviderCredentials } from "~/types/sms.types";
import { renderTemplate } from "~/lib/templates/sms-template.renderer";

const MSG91_BASE = "https://api.msg91.com";
const TIMEOUT_MS = 10_000;

export class Msg91Provider implements ISmsProvider {
  readonly type: SmsProviderType = "msg91";
  readonly name = "MSG91";

  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly templateId: string;

  constructor(credentials: SmsProviderCredentials) {
    if (!credentials.apiKey) throw new Error("MSG91 requires apiKey");
    this.apiKey = credentials.apiKey;
    this.senderId = credentials.senderId ?? "OTPPIN";
    this.templateId = credentials.templateId ?? "";
  }

  async sendOTP(
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<SmsResult> {
    const start = Date.now();

    try {
      const mobile = to.startsWith("+") ? to.slice(1) : to;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const body = JSON.stringify({
        template_id: this.templateId,
        mobile,
        authkey: this.apiKey,
        otp,
        ...(this.senderId ? { sender: this.senderId } : {}),
      });

      const resp = await fetch(`${MSG91_BASE}/api/v5/otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: this.apiKey,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      const json = (await resp.json()) as {
        type?: string;
        message?: string;
        request_id?: string;
      };

      if (!resp.ok || json.type === "error") {
        return {
          success: false,
          errorCode: String(resp.status),
          errorMessage: json.message ?? "MSG91 error",
          provider: this.type,
          latencyMs: Date.now() - start,
        };
      }

      return {
        success: true,
        messageId: json.request_id,
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    }
  }

  async sendMessage(to: string, message: string): Promise<SmsResult> {
    const start = Date.now();

    try {
      const mobile = to.startsWith("+") ? to.slice(1) : to;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(`${MSG91_BASE}/api/v5/flow`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authkey: this.apiKey,
        },
        body: JSON.stringify({
          template_id: this.templateId,
          recipients: [{ mobiles: mobile }],
          sender: this.senderId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const json = (await resp.json()) as { type?: string; message?: string; request_id?: string };

      if (!resp.ok || json.type === "error") {
        return {
          success: false,
          errorMessage: json.message ?? "MSG91 error",
          provider: this.type,
          latencyMs: Date.now() - start,
        };
      }

      return {
        success: true,
        messageId: json.request_id,
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown",
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    }
  }

  async validate(): Promise<boolean> {
    try {
      const resp = await fetch(`${MSG91_BASE}/api/balance.php?authkey=${this.apiKey}&type=1`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  async checkBalance(): Promise<BalanceResult> {
    try {
      const resp = await fetch(
        `${MSG91_BASE}/api/balance.php?authkey=${this.apiKey}&type=1`
      );
      const json = (await resp.json()) as { credits?: string };
      return {
        balance: parseFloat(json.credits ?? "0"),
        currency: "credits",
        provider: this.type,
      };
    } catch {
      return { balance: 0, currency: "credits", provider: this.type };
    }
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const resp = await fetch(
        `${MSG91_BASE}/api/balance.php?authkey=${this.apiKey}&type=1`
      );
      return {
        healthy: resp.ok,
        latencyMs: Date.now() - start,
        provider: this.type,
        errorMessage: resp.ok ? undefined : `HTTP ${resp.status}`,
      };
    } catch (err) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        provider: this.type,
        errorMessage: err instanceof Error ? err.message : "Unknown",
      };
    }
  }
}
