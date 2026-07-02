import { z } from "zod";

const OTP_CHANNEL_VALUES = ["sms", "email", "whatsapp", "voice"] as const;

// ─── Generate OTP ─────────────────────────────────────────────────────────────

export const otpGenerateSchema = z.object({
  shop: z
    .string({ required_error: "shop is required" })
    .min(3, "Invalid shop domain")
    .toLowerCase()
    .trim(),

  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),

  email: z
    .string()
    .email("Invalid email address")
    .toLowerCase()
    .trim()
    .optional()
    .transform((v) => v || undefined),

  channel: z.enum(OTP_CHANNEL_VALUES, {
    errorMap: () => ({ message: "channel must be one of: sms, email, whatsapp, voice" }),
  }),

  countryCode: z
    .string()
    .length(2)
    .toUpperCase()
    .optional()
    .transform((v) => v || undefined),
});

export type OtpGenerateInput = z.infer<typeof otpGenerateSchema>;

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export const otpVerifySchema = z.object({
  shop: z
    .string({ required_error: "shop is required" })
    .min(3, "Invalid shop domain")
    .toLowerCase()
    .trim(),

  requestId: z
    .string({ required_error: "requestId is required" })
    .length(32, "Invalid requestId format")
    .trim(),

  code: z
    .string({ required_error: "OTP code is required" })
    .min(4, "OTP code too short")
    .max(8, "OTP code too long")
    .regex(/^\d+$/, "OTP must contain only digits")
    .trim(),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

// ─── Resend OTP ───────────────────────────────────────────────────────────────

export const otpResendSchema = z.object({
  shop: z
    .string({ required_error: "shop is required" })
    .min(3)
    .toLowerCase()
    .trim(),

  requestId: z
    .string({ required_error: "requestId is required" })
    .length(32, "Invalid requestId format")
    .trim(),
});

export type OtpResendInput = z.infer<typeof otpResendSchema>;
