/**
 * Generic REST SMS provider.
 *
 * Supports any HTTP/HTTPS SMS gateway that accepts a JSON or form-encoded
 * POST (or GET) request. The entire request shape is configurable via credentials.
 *
 * Credential fields (stored encrypted in DB):
 *   endpoint        — full URL of the send endpoint (required)
 *   method          — "GET" | "POST" (default: "POST")
 *   authType        — "none" | "basic" | "bearer" | "api_key_header" | "api_key_query"
 *   apiKey          — API key (for bearer / api_key_* modes)
 *   username        — for basic auth
 *   password        — for basic auth
 *   apiKeyHeader    — header name for api_key_header mode (e.g. "X-API-Key")
 *   apiKeyQuery     — query param name for api_key_query mode (e.g. "apikey")
 *   bodyTemplate    — JSON string with {{phone}}, {{message}}, {{otp}} placeholders
 *   phoneField      — field name for phone number (used when bodyTemplate absent)
 *   messageField    — field name for message body (used when bodyTemplate absent)
 *   contentType     — "json" | "form" (default: "json")
 *   senderId        — optional sender ID to include in requests
 *   senderField     — field name for sender ID
 *   successPath     — dot-separated path to success flag in response (e.g. "status")
 *   successValue    — value at successPath that indicates success (e.g. "ok")
 *   messageIdPath   — dot-separated path to message ID in response
 */

import type {
  ISmsProvider,
  SmsResult,
  BalanceResult,
  HealthResult,
} from "~/lib/sms/interfaces/sms-provider.interface";
import type { SmsProviderType, SmsProviderCredentials } from "~/types/sms.types";
import { renderTemplate } from "~/lib/templates/sms-template.renderer";

const TIMEOUT_MS = 10_000;

function deepGet(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export class GenericRestProvider implements ISmsProvider {
  readonly type: SmsProviderType = "generic_rest";
  readonly name: string;

  private readonly creds: SmsProviderCredentials;

  constructor(credentials: SmsProviderCredentials, displayName = "Generic REST") {
    if (!credentials.endpoint) throw new Error("Generic REST requires endpoint");
    this.creds = credentials;
    this.name = displayName;
  }

  async sendOTP(
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<SmsResult> {
    const message = renderTemplate(template, { ...variables, otp });
    return this.sendMessage(to, message, otp);
  }

  async sendMessage(to: string, message: string, otp?: string): Promise<SmsResult> {
    const start = Date.now();
    const { endpoint = "", method = "POST" } = this.creds;

    try {
      const headers: Record<string, string> = {};
      let url = endpoint;

      // Build auth headers
      const { authType = "none", apiKey, username, password } = this.creds;
      if (authType === "bearer" && apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else if (authType === "basic" && username && password) {
        headers["Authorization"] =
          "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
      } else if (authType === "api_key_header" && apiKey) {
        headers[this.creds.apiKeyHeader ?? "X-API-Key"] = apiKey;
      } else if (authType === "api_key_query" && apiKey) {
        const sep = url.includes("?") ? "&" : "?";
        url += `${sep}${this.creds.apiKeyQuery ?? "apikey"}=${encodeURIComponent(apiKey)}`;
      }

      let body: string | undefined;
      const contentType = this.creds.contentType ?? "json";

      if (this.creds.bodyTemplate) {
        body = renderTemplate(this.creds.bodyTemplate, {
          phone: to,
          message,
          otp: otp ?? "",
          sender: this.creds.senderId ?? "",
        });
        headers["Content-Type"] =
          contentType === "form" ? "application/x-www-form-urlencoded" : "application/json";
      } else {
        const phoneField = this.creds.phoneField ?? "to";
        const msgField = this.creds.messageField ?? "message";

        if (contentType === "form") {
          const params = new URLSearchParams({ [phoneField]: to, [msgField]: message });
          if (this.creds.senderField && this.creds.senderId) {
            params.set(this.creds.senderField, this.creds.senderId);
          }
          body = params.toString();
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        } else {
          const payload: Record<string, string> = { [phoneField]: to, [msgField]: message };
          if (this.creds.senderField && this.creds.senderId) {
            payload[this.creds.senderField] = this.creds.senderId;
          }
          body = JSON.stringify(payload);
          headers["Content-Type"] = "application/json";
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(url, {
        method: method as "GET" | "POST",
        headers,
        body: method === "GET" ? undefined : body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      let json: unknown;
      try {
        json = await resp.json();
      } catch {
        json = {};
      }

      // Determine success
      let success = resp.ok;
      if (this.creds.successPath && this.creds.successValue !== undefined) {
        success = deepGet(json, this.creds.successPath) === this.creds.successValue;
      }

      const messageId = this.creds.messageIdPath
        ? String(deepGet(json, this.creds.messageIdPath) ?? "")
        : undefined;

      return {
        success,
        messageId: messageId || undefined,
        errorMessage: success ? undefined : `HTTP ${resp.status}`,
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
    const result = await this.health();
    return result.healthy;
  }

  async checkBalance(): Promise<BalanceResult> {
    // Generic providers don't have a standard balance endpoint
    return { balance: -1, currency: "N/A", provider: this.type };
  }

  async health(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const resp = await fetch(this.creds.endpoint ?? "", { method: "HEAD" });
      return {
        healthy: resp.status < 500,
        latencyMs: Date.now() - start,
        provider: this.type,
        errorMessage: resp.status >= 500 ? `HTTP ${resp.status}` : undefined,
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
