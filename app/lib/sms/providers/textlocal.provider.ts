/**
 * TextLocal SMS provider (India-focused).
 *
 * Uses the TextLocal REST API.
 * Docs: https://api.textlocal.in/docs/
 *
 * Required credentials:
 *   apiKey   — from TextLocal account
 *   senderId — 6-character sender name (e.g. "OTPPIN")
 */

import type {
  ISmsProvider,
  SmsResult,
  BalanceResult,
  HealthResult,
} from "~/lib/sms/interfaces/sms-provider.interface";
import type { SmsProviderType, SmsProviderCredentials } from "~/types/sms.types";
import { renderTemplate } from "~/lib/templates/sms-template.renderer";

const TEXTLOCAL_BASE = "https://api.textlocal.in";
const TIMEOUT_MS = 10_000;

export class TextLocalProvider implements ISmsProvider {
  readonly type: SmsProviderType = "textlocal";
  readonly name = "TextLocal";

  private readonly apiKey: string;
  private readonly senderId: string;

  constructor(credentials: SmsProviderCredentials) {
    if (!credentials.apiKey) throw new Error("TextLocal requires apiKey");
    this.apiKey = credentials.apiKey;
    this.senderId = credentials.senderId ?? "TXTLCL";
  }

  async sendOTP(
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<SmsResult> {
    const message = renderTemplate(template, { ...variables, otp });
    return this.sendMessage(to, message);
  }

  async sendMessage(to: string, message: string): Promise<SmsResult> {
    const start = Date.now();

    try {
      // TextLocal expects numbers without the leading +
      const number = to.startsWith("+") ? to.slice(1) : to;

      const params = new URLSearchParams({
        apikey: this.apiKey,
        numbers: number,
        message,
        sender: this.senderId,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(`${TEXTLOCAL_BASE}/send/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const json = (await resp.json()) as {
        status?: string;
        errors?: { code: number; message: string }[];
        messages?: { id: string }[];
      };

      if (!resp.ok || json.status === "failure") {
        const errMsg = json.errors?.[0]?.message ?? "TextLocal error";
        return {
          success: false,
          errorCode: String(json.errors?.[0]?.code ?? resp.status),
          errorMessage: errMsg,
          provider: this.type,
          latencyMs: Date.now() - start,
        };
      }

      return {
        success: true,
        messageId: json.messages?.[0]?.id,
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

  async validate(): Promise<boolean> {
    try {
      const resp = await fetch(`${TEXTLOCAL_BASE}/balance/?apikey=${this.apiKey}`);
      const json = (await resp.json()) as { status?: string };
      return json.status === "success";
    } catch {
      return false;
    }
  }

  async checkBalance(): Promise<BalanceResult> {
    try {
      const resp = await fetch(`${TEXTLOCAL_BASE}/balance/?apikey=${this.apiKey}`);
      const json = (await resp.json()) as { balance?: { sms: number } };
      return {
        balance: json.balance?.sms ?? 0,
        currency: "credits",
        unit: "sms",
        provider: this.type,
      };
    } catch {
      return { balance: 0, currency: "credits", provider: this.type };
    }
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const resp = await fetch(`${TEXTLOCAL_BASE}/balance/?apikey=${this.apiKey}`);
      const json = (await resp.json()) as { status?: string };
      const healthy = json.status === "success";
      return {
        healthy,
        latencyMs: Date.now() - start,
        provider: this.type,
        errorMessage: healthy ? undefined : "TextLocal balance check failed",
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
