export type OTP_LENGTH = 4 | 5 | 6 | 8;
export type OTP_EXPIRY = 30 | 60 | 120 | 300 | 600;
export type OTP_CHANNEL = "sms" | "email" | "whatsapp" | "voice";
export type OTP_STATUS =
  | "pending"
  | "sent"
  | "verified"
  | "expired"
  | "failed"
  | "blocked";

export interface IOtpRequest {
  shopDomain: string;
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
  ipAddress: string;
  userAgent: string;
  customerId?: string;
}

export interface IOtpVerifyRequest {
  shopDomain: string;
  otpId: string;
  code: string;
  ipAddress: string;
}

export interface IOtpRecord {
  id: string;
  shopDomain: string;
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
  codeHash: string;
  salt: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  status: OTP_STATUS;
  ipAddress: string;
  userAgent: string;
  customerId?: string;
  verifiedAt?: Date;
  createdAt: Date;
}
