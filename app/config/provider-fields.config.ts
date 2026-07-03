/**
 * Per-provider credential field definitions.
 *
 * Drives both form rendering (labels, types, placeholders) and
 * server-side credential object assembly. Safe for client bundles
 * — contains no credentials, only metadata.
 */

import type { SmsProviderType } from "~/types/sms.types";

export interface ProviderFieldDef {
  /** Key used in SmsProviderCredentials / form input name */
  key: string;
  label: string;
  required: boolean;
  /** Masked in the UI — shown as password input */
  sensitive: boolean;
  multiline?: boolean;
  placeholder?: string;
  helpText?: string;
  default?: string;
}

export interface ProviderConfig {
  label: string;
  /** Short description shown in the Add Provider dropdown */
  description: string;
  fields: ProviderFieldDef[];
}

export const PROVIDER_CONFIGS: Partial<Record<SmsProviderType, ProviderConfig>> = {
  twilio: {
    label: "Twilio",
    description: "Global SMS via Twilio Messaging API",
    fields: [
      {
        key: "accountSid",
        label: "Account SID",
        required: true,
        sensitive: true,
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        helpText: "Found in your Twilio Console dashboard",
      },
      {
        key: "authToken",
        label: "Auth Token",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Your Twilio auth token",
      },
      {
        key: "senderId",
        label: "From Number / Messaging Service SID",
        required: true,
        sensitive: false,
        placeholder: "+15551234567 or MG...",
        helpText: "E.164 format phone number or Messaging Service SID",
      },
    ],
  },

  msg91: {
    label: "MSG91",
    description: "India-focused SMS via MSG91 OTP API v5",
    fields: [
      {
        key: "apiKey",
        label: "Auth Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Found in your MSG91 dashboard under API",
      },
      {
        key: "senderId",
        label: "Sender ID",
        required: true,
        sensitive: false,
        placeholder: "OTPLOGIN",
        helpText: "6-character sender ID approved in India",
      },
      {
        key: "templateId",
        label: "OTP Template ID",
        required: false,
        sensitive: false,
        placeholder: "6234...",
        helpText: "DLT-approved template ID (required for India traffic)",
      },
    ],
  },

  textlocal: {
    label: "TextLocal",
    description: "UK/India SMS via TextLocal REST API",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Found in TextLocal under API Keys",
      },
      {
        key: "senderId",
        label: "Sender Name",
        required: true,
        sensitive: false,
        placeholder: "OTPLOGIN",
        helpText: "Max 11 alphanumeric characters",
      },
    ],
  },

  aws_sns: {
    label: "AWS SNS",
    description: "Amazon Simple Notification Service",
    fields: [
      {
        key: "accessKeyId",
        label: "AWS Access Key ID",
        required: true,
        sensitive: false,
        placeholder: "AKIAIOSFODNN7EXAMPLE",
      },
      {
        key: "secretAccessKey",
        label: "AWS Secret Access Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "region",
        label: "AWS Region",
        required: true,
        sensitive: false,
        placeholder: "us-east-1",
        helpText: "e.g. us-east-1, ap-south-1",
      },
      {
        key: "senderId",
        label: "Sender ID (optional)",
        required: false,
        sensitive: false,
        placeholder: "OTPLOGIN",
        helpText: "Alphanumeric sender ID, not available in all regions",
      },
    ],
  },

  vonage: {
    label: "Vonage (Nexmo)",
    description: "Global SMS via Vonage SMS API",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: false,
        placeholder: "a1b2c3d4",
      },
      {
        key: "apiSecret",
        label: "API Secret",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "senderId",
        label: "From / Sender ID",
        required: true,
        sensitive: false,
        placeholder: "OTPLogin",
        helpText: "Alphanumeric sender or phone number",
      },
    ],
  },

  plivo: {
    label: "Plivo",
    description: "Global SMS via Plivo API",
    fields: [
      {
        key: "authId",
        label: "Auth ID",
        required: true,
        sensitive: false,
        placeholder: "MAXXXXXXXXXXXXXXXXXX",
      },
      {
        key: "authToken",
        label: "Auth Token",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "senderId",
        label: "From Number / Sender ID",
        required: true,
        sensitive: false,
        placeholder: "+15551234567",
      },
    ],
  },

  kaleyra: {
    label: "Kaleyra",
    description: "India/Global SMS via Kaleyra",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "sid",
        label: "SID",
        required: true,
        sensitive: false,
        placeholder: "SID...",
      },
      {
        key: "senderId",
        label: "Sender ID",
        required: true,
        sensitive: false,
        placeholder: "OTPLOGIN",
      },
    ],
  },

  fast2sms: {
    label: "Fast2SMS",
    description: "India SMS via Fast2SMS",
    fields: [
      {
        key: "apiKey",
        label: "Authorization Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Found in your Fast2SMS developer dashboard",
      },
      {
        key: "senderId",
        label: "Sender ID",
        required: false,
        sensitive: false,
        placeholder: "OTPLOGIN",
      },
    ],
  },

  gupshup: {
    label: "Gupshup",
    description: "India/Global SMS via Gupshup",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "appId",
        label: "App Name / App ID",
        required: true,
        sensitive: false,
        placeholder: "myapp",
      },
      {
        key: "senderId",
        label: "Sender ID",
        required: true,
        sensitive: false,
        placeholder: "OTPLOGIN",
      },
    ],
  },

  infobip: {
    label: "Infobip",
    description: "Global SMS via Infobip API",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "baseUrl",
        label: "Base URL",
        required: true,
        sensitive: false,
        placeholder: "xxxxx.api.infobip.com",
        helpText: "Your Infobip subdomain base URL",
      },
      {
        key: "senderId",
        label: "Sender ID",
        required: false,
        sensitive: false,
        placeholder: "OTPLogin",
      },
    ],
  },

  clickatell: {
    label: "Clickatell",
    description: "Global SMS via Clickatell API",
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "senderId",
        label: "From / Sender ID",
        required: false,
        sensitive: false,
        placeholder: "OTPLogin",
      },
    ],
  },

  exotel: {
    label: "Exotel",
    description: "India SMS via Exotel",
    fields: [
      {
        key: "accountSid",
        label: "Account SID",
        required: true,
        sensitive: false,
        placeholder: "your_account_sid",
      },
      {
        key: "apiKey",
        label: "API Key",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "apiToken",
        label: "API Token",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
      },
      {
        key: "senderId",
        label: "From / ExoPhone",
        required: true,
        sensitive: false,
        placeholder: "+914422224444",
      },
    ],
  },

  growwsaas: {
    label: "GrowwSaaS SMS",
    description: "India SMS via GrowwSaaS OTP gateway",
    fields: [
      {
        key: "username",
        label: "Username",
        required: true,
        sensitive: false,
        placeholder: "your_growwsaas_username",
        helpText: "Your GrowwSaaS account username",
      },
      {
        key: "password",
        label: "Password",
        required: true,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Your GrowwSaaS account password",
      },
      {
        key: "senderId",
        label: "Sender ID (From)",
        required: true,
        sensitive: false,
        placeholder: "DSRB",
        helpText: "DLT-approved sender header (e.g. DSRB)",
      },
      {
        key: "endpoint",
        label: "API Endpoint (optional)",
        required: false,
        sensitive: false,
        placeholder: "https://otp.growwsaas.com/fe/api/v1/send",
        default: "https://otp.growwsaas.com/fe/api/v1/send",
        helpText: "Leave blank to use default GrowwSaaS endpoint",
      },
    ],
  },

  generic_rest: {
    label: "Generic REST / Custom HTTP",
    description: "Any HTTP SMS API — GET query params or POST JSON/form",
    fields: [
      {
        key: "endpoint",
        label: "API Endpoint URL",
        required: true,
        sensitive: false,
        placeholder: "https://api.provider.com/send",
      },
      {
        key: "method",
        label: "HTTP Method",
        required: true,
        sensitive: false,
        placeholder: "GET",
        default: "GET",
        helpText: "GET (query-param APIs) or POST (JSON/form body APIs)",
      },
      {
        key: "authType",
        label: "Auth Type",
        required: true,
        sensitive: false,
        placeholder: "none",
        default: "none",
        helpText: "none | bearer | basic | api_key_header | api_key_query",
      },
      {
        key: "apiKey",
        label: "API Key / Bearer Token",
        required: false,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Used when authType is bearer, api_key_header, or api_key_query",
      },
      {
        key: "username",
        label: "Username (basic auth only)",
        required: false,
        sensitive: false,
        placeholder: "myusername",
        helpText: "Only needed when authType is basic",
      },
      {
        key: "password",
        label: "Password (basic auth only)",
        required: false,
        sensitive: true,
        placeholder: "••••••••",
        helpText: "Only needed when authType is basic",
      },
      {
        key: "bodyTemplate",
        label: "Request Params Template (JSON)",
        required: false,
        sensitive: false,
        multiline: true,
        placeholder:
          '{"username":"myuser","password":"mypass","from":"SENDER","to":"{{phone}}","text":"{{message}}"}',
        helpText:
          'JSON object whose keys become URL query params (GET) or body fields (POST). Supports {{phone}}, {{message}}, {{otp}}.',
      },
      {
        key: "successPath",
        label: "Success Response Path",
        required: false,
        sensitive: false,
        placeholder: "status",
        helpText: "Dot-notation path in JSON response to check (leave blank to use HTTP status)",
      },
      {
        key: "successValue",
        label: "Expected Success Value",
        required: false,
        sensitive: false,
        placeholder: "ok",
        helpText: "Value at the above path that means success",
      },
    ],
  },
};

/** Ordered list for the provider type selector (excludes "default"). */
export const PROVIDER_TYPE_OPTIONS = (
  Object.entries(PROVIDER_CONFIGS) as Array<[SmsProviderType, ProviderConfig]>
).map(([type, cfg]) => ({
  value: type,
  label: cfg.label,
  description: cfg.description,
}));

export function getProviderConfig(type: SmsProviderType): ProviderConfig | null {
  return PROVIDER_CONFIGS[type] ?? null;
}

/** Returns true if a field key is marked sensitive in the provider's config. */
export function isFieldSensitive(type: SmsProviderType, fieldKey: string): boolean {
  return (
    PROVIDER_CONFIGS[type]?.fields.find((f) => f.key === fieldKey)?.sensitive ??
    false
  );
}
