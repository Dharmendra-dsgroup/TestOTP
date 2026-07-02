import type { TimestampFields } from "./common.types";
import type { OTP_CHANNEL } from "./otp.types";

export type AnalyticsPeriod = "hourly" | "daily" | "weekly" | "monthly";

export interface IAnalyticsRecord extends TimestampFields {
  shopDomain: string;
  period: AnalyticsPeriod;
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  otpRequested: number;
  otpSent: number;
  otpVerified: number;
  otpFailed: number;
  otpExpired: number;
  otpBlocked: number;
  newCustomers: number;
  returningCustomers: number;
  loginCount: number;
  registrationCount: number;
  smsDelivered: number;
  smsFailed: number;
  emailDelivered: number;
  emailFailed: number;
  byCountry: Record<string, number>;
  byChannel: Record<OTP_CHANNEL, number>;
  avgVerificationTimeMs: number;
  successRate: number;
}

export type AnalyticsIncrementFields = Partial<
  Pick<
    IAnalyticsRecord,
    | "otpRequested"
    | "otpSent"
    | "otpVerified"
    | "otpFailed"
    | "otpExpired"
    | "otpBlocked"
    | "newCustomers"
    | "returningCustomers"
    | "loginCount"
    | "registrationCount"
    | "smsDelivered"
    | "smsFailed"
    | "emailDelivered"
    | "emailFailed"
  >
>;
