export const APP = {
  NAME: "OTP Login Pro",
  VERSION: "1.0.0",
  HANDLE: "otp-login-pro",
  SUPPORT_EMAIL: "support@otploginpro.com",
} as const;

export const OTP = {
  DEFAULT_LENGTH: 6,
  DEFAULT_EXPIRY_SECONDS: 120,
  DEFAULT_MAX_ATTEMPTS: 5,
  DEFAULT_RESEND_DELAY_SECONDS: 30,
  HASH_ALGORITHM: "sha256",
  REDIS_PREFIX: "otp:",
  ATTEMPT_PREFIX: "otp:attempt:",
  RATE_LIMIT_PREFIX: "rate:otp:",
  ALLOWED_LENGTHS: [4, 5, 6, 8] as const,
  ALLOWED_EXPIRY_SECONDS: [30, 60, 120, 300, 600] as const,
} as const;

export const REDIS_KEYS = {
  SESSION_PREFIX: "session:",
  CACHE_PREFIX: "cache:",
  RATE_LIMIT_PREFIX: "ratelimit:",
  OTP_PREFIX: "otp:",
  BLACKLIST_PREFIX: "blacklist:",
  BLOCKED_IP_PREFIX: "blocked:ip:",
  BLOCKED_PHONE_PREFIX: "blocked:phone:",
  DEFAULT_TTL_SECONDS: 3_600,
} as const;

export const BILLING = {
  TRIAL_DAYS: 7,
  PLANS: {
    FREE: "free",
    STARTER: "starter",
    GROWTH: "growth",
    ENTERPRISE: "enterprise",
  } as const,
  OTP_LIMITS: {
    free: 100,
    starter: 1_000,
    growth: 10_000,
    enterprise: -1, // unlimited
  } as const,
} as const;

export const WEBHOOK_TOPICS = {
  APP_UNINSTALLED: "APP_UNINSTALLED",
  CUSTOMERS_DATA_REQUEST: "CUSTOMERS_DATA_REQUEST",
  CUSTOMERS_REDACT: "CUSTOMERS_REDACT",
  SHOP_REDACT: "SHOP_REDACT",
  CUSTOMERS_CREATE: "CUSTOMERS_CREATE",
  CUSTOMERS_UPDATE: "CUSTOMERS_UPDATE",
  CUSTOMERS_DELETE: "CUSTOMERS_DELETE",
  SHOP_UPDATE: "SHOP_UPDATE",
} as const;

export const RATE_LIMITS = {
  OTP_PER_PHONE_PER_HOUR: 5,
  OTP_PER_IP_PER_HOUR: 20,
  OTP_PER_STORE_PER_HOUR: 1_000,
  VERIFY_ATTEMPTS_PER_OTP: 5,
  API_PER_IP_PER_MINUTE: 60,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const SMS_PROVIDERS = {
  DEFAULT: "default",
  TWILIO: "twilio",
  MSG91: "msg91",
  TEXTLOCAL: "textlocal",
  AWS_SNS: "aws_sns",
  VONAGE: "vonage",
  EXOTEL: "exotel",
  PLIVO: "plivo",
  KALEYRA: "kaleyra",
  FAST2SMS: "fast2sms",
  GUPSHUP: "gupshup",
  INFOBIP: "infobip",
  CLICKATELL: "clickatell",
  GENERIC_REST: "generic_rest",
} as const;

export const WIDGET_TYPES = {
  POPUP: "popup",
  INLINE: "inline",
  SLIDE_OVER: "slide-over",
  FLOATING: "floating",
  DEDICATED_PAGE: "dedicated-page",
} as const;

export const SHOPIFY_API_VERSION = "2025-01";
