/**
 * Twilio SMS provider.
 *
 * Uses the Twilio REST API directly (no SDK dependency) to keep the bundle lean.
 * Docs: https://www.twilio.com/docs/messaging/api/message-resource
 *
 * Required credentials (stored encrypted in DB):
 *   accountSid  — AC...
 *   authToken   — your auth token
 *   senderId    — phone number or messaging service SID (e.g. +1234567890 or MG...)
 */

import type {
  ISmsProvider,
  SmsResult,
  BalanceResult,
  HealthResult,
} from "~/lib/sms/interfaces/sms-provider.interface";
import type { SmsProviderType, SmsProviderCredentials } from "~/types/sms.types";
import { renderTemplate } from "~/lib/templates/sms-template.renderer";

const TWILIO_BASE_URL = "https://api.twilio.com/2010-04-01";
const TIMEOUT_MS = 10_000;

export class TwilioProvider implements ISmsProvider {
  readonly type: SmsProviderType = "twilio";
  readonly name = "Twilio";

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly from: string;
  private readonly authHeader: string;

  constructor(credentials: SmsProviderCredentials) {
    if (!credentials.accountSid || !credentials.authToken) {
      throw new Error("Twilio requires accountSid and authToken");
    }

    this.accountSid = credentials.accountSid;
    this.authToken = credentials.authToken;
    this.from = credentials.senderId ?? credentials.accountSid;
    this.authHeader =
      "Basic " +
      Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
  }

  async sendOTP(
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<SmsResult> {
    const body = renderTemplate(template, { ...variables, otp });
    return this.sendMessage(to, body);
  }

  async sendMessage(to: string, message: string): Promise<SmsResult> {
    const start = Date.now();

    try {
      const url = `${TWILIO_BASE_URL}/Accounts/${this.accountSid}/Messages.json`;
      const params = new URLSearchParams({
        To: to,
        From: this.from,
        Body: message,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timer);

      const json = (await resp.json()) as {
        sid?: string;
        error_code?: number;
        message?: string;
        price?: string;
      };

      if (!resp.ok) {
        return {
          success: false,
          errorCode: String(json.error_code ?? resp.status),
          errorMessage: json.message ?? `HTTP ${resp.status}`,
          provider: this.type,
          latencyMs: Date.now() - start,
        };
      }

      return {
        success: true,
        messageId: json.sid,
        cost: json.price ? Math.abs(parseFloat(json.price)) : undefined,
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return {
        success: false,
        errorMessage,
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    }
  }

  async validate(): Promise<boolean> {
    try {
      const url = `${TWILIO_BASE_URL}/Accounts/${this.accountSid}.json`;
      const resp = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async checkBalance(): Promise<BalanceResult> {
    try {
      const url = `${TWILIO_BASE_URL}/Accounts/${this.accountSid}/Balance.json`;
      const resp = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });
      const json = (await resp.json()) as { balance?: string; currency?: string };
      return {
        balance: parseFloat(json.balance ?? "0"),
        currency: json.currency ?? "USD",
        provider: this.type,
      };
    } catch {
      return { balance: 0, currency: "USD", provider: this.type };
    }
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const url = `${TWILIO_BASE_URL}/Accounts/${this.accountSid}.json`;
      const resp = await fetch(url, {
        headers: { Authorization: this.authHeader },
      });
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
