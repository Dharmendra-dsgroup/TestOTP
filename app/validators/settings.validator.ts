import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (e.g. #FF5500)")
  .optional()
  .or(z.literal(""));

export const generalSettingsSchema = z.object({
  buttonText: z
    .string()
    .min(1, "Button text is required")
    .max(50, "Button text must be 50 characters or less"),
  brandColor: hexColor,
  logoUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  darkMode: z.coerce.boolean(),
  widgetType: z.enum(["popup", "inline", "slide-over", "floating"]),
  popupPosition: z.enum(["center", "top", "bottom-left", "bottom-right"]),
  customCss: z
    .string()
    .max(10_000, "Custom CSS must be under 10,000 characters")
    .optional()
    .or(z.literal("")),
  customJs: z
    .string()
    .max(10_000, "Custom JS must be under 10,000 characters")
    .optional()
    .or(z.literal("")),
  language: z.string().length(2, "Must be a 2-letter language code"),
});

export const otpSettingsSchema = z.object({
  otpLength: z.coerce
    .number()
    .refine((v) => [4, 5, 6, 8].includes(v), "OTP length must be 4, 5, 6, or 8"),
  otpExpiry: z.coerce
    .number()
    .refine(
      (v) => [30, 60, 120, 300, 600].includes(v),
      "OTP expiry must be 30, 60, 120, 300, or 600 seconds"
    ),
  maxAttempts: z.coerce
    .number()
    .int()
    .min(1, "Min 1 attempt")
    .max(10, "Max 10 attempts"),
  resendDelay: z.coerce
    .number()
    .int()
    .min(10, "Min 10 seconds")
    .max(300, "Max 300 seconds"),
  enableSmsOtp: z.coerce.boolean(),
  enableEmailOtp: z.coerce.boolean(),
});

export const securitySettingsSchema = z.object({
  captchaEnabled: z.coerce.boolean(),
  vpnDetectionEnabled: z.coerce.boolean(),
  autoDetectCountry: z.coerce.boolean(),
});

export const countrySettingsSchema = z
  .object({
    allowedCountries: z.array(z.string().length(2).toUpperCase()),
    blockedCountries: z.array(z.string().length(2).toUpperCase()),
  })
  .refine(
    (data) =>
      data.allowedCountries.filter((c) => data.blockedCountries.includes(c))
        .length === 0,
    { message: "A country cannot be in both allowed and blocked lists" }
  );

export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>;
export type OtpSettingsInput = z.infer<typeof otpSettingsSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
export type CountrySettingsInput = z.infer<typeof countrySettingsSchema>;
