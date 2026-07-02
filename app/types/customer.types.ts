import type { TimestampFields } from "./common.types";

export type CustomerVerificationChannel = "sms" | "email" | "whatsapp";

export interface ICustomer extends TimestampFields {
  shopDomain: string;
  shopifyCustomerId: string;
  phone?: string;
  phoneNormalized?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  phoneVerifiedAt?: Date;
  emailVerifiedAt?: Date;
  verificationChannel?: CustomerVerificationChannel;
  tags: string[];
  acceptsMarketing: boolean;
  totalOtpRequests: number;
  totalSuccessfulVerifications: number;
  lastOtpRequestAt?: Date;
  lastLoginAt?: Date;
  loginCount: number;
  isBlocked: boolean;
  blockedReason?: string;
  blockedAt?: Date;
  countryCode?: string;
  locale?: string;
}

export type CustomerCreateInput = Pick<
  ICustomer,
  | "shopDomain"
  | "shopifyCustomerId"
  | "phone"
  | "email"
  | "firstName"
  | "lastName"
  | "countryCode"
>;

export type CustomerUpdateInput = Partial<
  Omit<ICustomer, "shopDomain" | "shopifyCustomerId" | "createdAt">
>;
