/**
 * GrowwSaaS SMS Provider
 *
 * GET https://otp.growwsaas.com/fe/api/v1/send
 *   ?username=<username>
 *   &password=<password>
 *   &unicode=false
 *   &from=<senderId>
 *   &to=<phone>
 *   &text=<message>
 *
 * Credentials stored in DB:
 *   username  — GrowwSaaS account username
 *   password  — GrowwSaaS account password
 *   senderId  — approved sender ID / header (e.g. "DSRB")
 *   endpoint  — optional override (defaults to the GrowwSaaS send URL)
 */

import type {
  ISmsProvider,
  SmsResult,
  BalanceResult,
  HealthResult,
} from "~/lib/sms/interfaces/sms-provider.interface";
import type { SmsProviderType, SmsProviderCredentials } from "~/types/sms.types";
import { renderTemplate } from "~/lib/templates/sms-template.renderer";

const DEFAULT_ENDPOINT = "https://otp.growwsaas.com/fe/api/v1/send";
const TIMEOUT_MS = 10_000;

export class GrowwSaasProvider implements ISmsProvider {
  readonly type: SmsProviderType = "growwsaas";
  readonly name: string;

  private readonly endpoint: string;
  private readonly username: string;
  private readonly password: string;
  private readonly senderId: string;

  constructor(credentials: SmsProviderCredentials, displayName = "GrowwSaaS") {
    if (!credentials.username) throw new Error("GrowwSaaS requires username");
    if (!credentials.password) throw new Error("GrowwSaaS requires password");

    this.endpoint = credentials.endpoint ?? DEFAULT_ENDPOINT;
    this.username = credentials.username;
    this.password = credentials.password;
    this.senderId = credentials.senderId ?? "";
    this.name = displayName;
  }

  async sendOTP(
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<SmsResult> {
    const text = renderTemplate(template, { ...variables, otp });
    return this.sendMessage(to, text, otp);
  }

  async sendMessage(to: string, message: string, _otp?: string): Promise<SmsResult> {
    const start = Date.now();

    // GrowwSaaS expects 10-digit number only (strip +91 or 91 prefix)
    let normalizedTo = to.startsWith("+") ? to.slice(1) : to;
    if (normalizedTo.startsWith("91") && normalizedTo.length === 12) {
      normalizedTo = normalizedTo.slice(2);
    }

    const params = new URLSearchParams({
      username: this.username,
      password: this.password,
      unicode: "false",
      from: this.senderId,
      to: normalizedTo,
      text: message,
    });

    // URLSearchParams encodes spaces as '+'; GrowwSaaS requires '%20'
    const url = `${this.endpoint}?${params.toString().replace(/\+/g, "%20")}`;

    const debugUrl = url.replace(encodeURIComponent(this.password), "***").replace(this.password, "***");
    console.info(`[GrowwSaaS] Sending SMS to ${normalizedTo} | from=${this.senderId} | url=${debugUrl}`);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timer);

      let responseText = "";
      try { responseText = await resp.text(); } catch { /* ignore */ }

      if (!resp.ok) {
        const errorMessage = `HTTP ${resp.status}: ${responseText.slice(0, 400)}`;
        console.error(`[GrowwSaaS] Send failed to ${normalizedTo}: ${errorMessage}`);
        return {
          success: false,
          errorMessage,
          provider: this.type,
          latencyMs: Date.now() - start,
        };
      }

      console.info(`[GrowwSaaS] SMS sent successfully to ${normalizedTo} (${Date.now() - start}ms): ${responseText.slice(0, 200)}`);
      return {
        success: true,
        messageId: responseText.slice(0, 100) || undefined,
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`[GrowwSaaS] Network error sending to ${normalizedTo}: ${errorMessage}`);
      return {
        success: false,
        errorMessage,
        provider: this.type,
        latencyMs: Date.now() - start,
      };
    }
  }

  async validate(): Promise<boolean> {
    const result = await this.health();
    return result.healthy;
  }

  async checkBalance(): Promise<BalanceResult> {
    return { balance: -1, currency: "N/A", provider: this.type };
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      // Any HTTP response = server reachable = healthy
      await fetch(this.endpoint, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
      });
      return { healthy: true, latencyMs: Date.now() - start, provider: this.type };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown";
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        provider: this.type,
        errorMessage,
      };
    }
  }
}
