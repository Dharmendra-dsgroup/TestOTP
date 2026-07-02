import type { TimestampFields } from "./common.types";

export type SmsProviderType =
  | "default"
  | "twilio"
  | "msg91"
  | "textlocal"
  | "aws_sns"
  | "vonage"
  | "exotel"
  | "plivo"
  | "kaleyra"
  | "fast2sms"
  | "gupshup"
  | "infobip"
  | "clickatell"
  | "generic_rest";

export type SmsProviderRole = "primary" | "secondary" | "fallback";
export type SmsProviderStatus = "active" | "inactive" | "error" | "rate_limited";

export type SmsTemplateType =
  | "login"
  | "signup"
  | "verification"
  | "password_reset"
  | "custom";

export interface ISmsProvider extends TimestampFields {
  shopDomain: string;
  name: string;
  type: SmsProviderType;
  role: SmsProviderRole;
  status: SmsProviderStatus;
  credentialsEncrypted: string;
  senderId?: string;
  webhookUrl?: string;
  rateLimitPerMinute: number;
  priority: number;
  isActive: boolean;
  isHealthy: boolean;
  lastHealthCheckAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  totalSent: number;
  totalFailed: number;
}

export interface ISmsTemplate extends TimestampFields {
  shopDomain: string;
  name: string;
  type: SmsTemplateType;
  content: string;
  language: string;
  isDefault: boolean;
  isActive: boolean;
  variables: string[];
  previewText?: string;
}

export interface SmsProviderCredentials {
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  senderId?: string;
  region?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  [key: string]: string | undefined;
}
