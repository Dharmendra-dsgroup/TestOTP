/**
 * OTP Service — full lifecycle orchestration.
 *
 * generateAndSend:
 *   fraud-check → rate-check → generate → Redis-store → MongoDB-log
 *   → send SMS directly → set-resend-cooldown → increment-usage → return requestId
 *
 * verify:
 *   Redis-get → expiry-check → increment-attempts → hash-compare
 *   → success: delete-Redis + update-MongoDB → failure: check-maxAttempts
 *
 * resend:
 *   resend-cooldown-check → invalidate-old-Redis → regenerate → send SMS directly
 *
 * Services NEVER throw. Every method returns ServiceResult<T>.
 */

import { createOtp } from "~/lib/otp/otp-generator";
import { otpStore } from "~/lib/otp/otp-store.server";
import { otpRateLimiter } from "~/lib/rate-limit/otp-rate-limit.server";
import { hashOtp, timingSafeEqual } from "~/utils/crypto";
import { normalizePhone, maskPhone, maskEmail, countryFromPhone } from "~/utils/phone";
import { defaultOtpTemplate } from "~/lib/templates/sms-template.renderer";
import { otpLogRepository } from "~/repositories/otp-log.repository";
import { shopRepository } from "~/repositories/shop.repository";
import { smsTemplateRepository } from "~/repositories/sms-template.repository";
import { fraudDetectionService } from "./fraud-detection.service";
import type { SmsTemplateType } from "~/types/sms.types";
import { providerResolver } from "~/lib/sms/provider-resolver.server";
import { analyticsService } from "./analytics.service";
import { billingService } from "./billing.service";
import { env } from "~/config/env";
import {
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "~/types/common.types";
import type { OTP_CHANNEL } from "~/types/otp.types";

// ─── Request / Response Types ─────────────────────────────────────────────────

export interface OtpGenerateRequest {
  shopDomain: string;
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
  ipAddress: string;
  userAgent: string;
  countryCode?: string;
}

export interface OtpGenerateResponse {
  requestId: string;
  expiresAt: Date;
  resendDelay: number;
  maskedDestination: string;
  channel: OTP_CHANNEL;
  otpLength: number;
}

export interface OtpVerifyRequest {
  shopDomain: string;
  requestId: string;
  code: string;
  ipAddress: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  phone?: string;
  email?: string;
  channel: OTP_CHANNEL;
  remainingAttempts?: number;
}

export interface OtpResendRequest {
  shopDomain: string;
  requestId: string;
  ipAddress: string;
}

export interface OtpResendResponse {
  requestId: string;
  expiresAt: Date;
  resendDelay: number;
  maskedDestination: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class OtpService {
  /**
   * Generates a new OTP, stores it in Redis, logs it in MongoDB, and enqueues
   * it for SMS delivery. Returns the requestId and masked destination.
   */
  async generateAndSend(
    req: OtpGenerateRequest
  ): Promise<ServiceResult<OtpGenerateResponse>> {
    const { shopDomain, channel, ipAddress, userAgent } = req;

    // 1. Normalize destination
    let phone: string | undefined;
    let email: string | undefined;

    if (channel === "sms" || channel === "whatsapp" || channel === "voice") {
      if (!req.phone) {
        return serviceFailure("Phone number is required for SMS/WhatsApp/Voice OTP", 400);
      }
      phone = normalizePhone(req.phone) ?? undefined;
      if (!phone) {
        return serviceFailure("Invalid phone number format. Please use international format.", 400);
      }
    } else if (channel === "email") {
      if (!req.email) {
        return serviceFailure("Email address is required for Email OTP", 400);
      }
      email = req.email.toLowerCase().trim();
    } else {
      return serviceFailure(`Unsupported OTP channel: ${channel}`, 400);
    }

    const destination = phone ?? email ?? "";
    const maskedDestination = phone ? maskPhone(phone) : maskEmail(email ?? "");
    const countryCode = req.countryCode ?? (phone ? (countryFromPhone(phone) ?? undefined) : undefined);

    // 2. Load shop & settings
    const shopDoc = await shopRepository.findByDomain(shopDomain);
    if (!shopDoc) {
      return serviceFailure("Shop not found", 404);
    }
    if (!shopDoc.isActive || !shopDoc.isInstalled) {
      return serviceFailure("Shop is not active", 403);
    }

    const settings = shopDoc.settings;
    const otpLength = settings?.otpLength ?? 6;
    const otpExpiry = settings?.otpExpiry ?? 120;
    const maxAttempts = settings?.maxAttempts ?? 5;
    const resendDelay = settings?.resendDelay ?? 30;

    // 3. Plan limit check — enforces monthly OTP quota
    const limitCheck = await billingService.checkPlanLimit(shopDomain);
    if (limitCheck.success && !limitCheck.data.allowed) {
      return serviceFailure(
        "Your store has reached its monthly OTP limit. Please upgrade your plan to continue.",
        402
      );
    }

    // 4. Fraud detection — blocklist, country, velocity, auto-block
    const fraudResult = await fraudDetectionService.evaluate(shopDomain, {
      phone,
      email,
      ipAddress,
      country: countryCode,
      channel: channel as string,
    });
    if (fraudResult.success && !fraudResult.data.allowed) {
      return serviceFailure(
        fraudResult.data.reason ?? "Your request has been blocked.",
        403
      );
    }

    // 5. Resend cooldown check (before rate limit to give a better error message)
    const resendCheck = await otpRateLimiter.checkResendCooldown(shopDomain, destination);
    if (!resendCheck.allowed) {
      return serviceFailure(
        `Please wait ${resendCheck.ttlSeconds} seconds before requesting a new OTP`,
        429
      );
    }

    // 6. Rate limit checks (phone + IP + store)
    if (phone) {
      const rlResult = await otpRateLimiter.checkGenerate(shopDomain, phone, ipAddress);
      if (!rlResult.allowed) {
        return serviceFailure(
          rlResult.reason === "phone_limit"
            ? "Too many OTP requests for this phone number. Please try again later."
            : rlResult.reason === "ip_limit"
            ? "Too many requests from your location. Please try again later."
            : "OTP quota exceeded for this store. Please try again later.",
          429
        );
      }
    }

    // 7. Generate OTP
    const generated = createOtp(otpLength as 4 | 5 | 6 | 8, otpExpiry);

    // 8. Store hash in Redis
    await otpStore.store(
      shopDomain,
      generated.requestId,
      {
        hash: generated.hash,
        salt: generated.salt,
        maxAttempts,
        expiresAt: generated.expiresAt.getTime(),
        phone,
        email,
        channel,
      },
      // TTL must outlive both the OTP expiry AND the resend window so that
      // a resend click at exactly resendDelay seconds never races against expiry.
      Math.max(otpExpiry + 30, resendDelay + 60)
    );

    // 9. Create OtpLog in MongoDB (status = "pending")
    await otpLogRepository.create({
      shopDomain,
      phone,
      email,
      channel,
      status: "pending",
      ipAddress,
      userAgent,
      country: countryCode,
      otpLength,
      expirySeconds: otpExpiry,
      maxAttempts,
      requestId: generated.requestId,
      expiresAt: generated.expiresAt,
    } as Parameters<typeof otpLogRepository.create>[0]).catch((err) => {
      console.error("[OtpService] Failed to create OtpLog:", err);
    });

    // 10. Load template — shop setting takes priority, then smsTemplates collection, then hardcoded default
    let template = settings?.smsTemplate || defaultOtpTemplate(otpExpiry);
    if (!settings?.smsTemplate) {
      try {
        const channelType: SmsTemplateType = channel === "email" ? "login" : "login";
        const tmpl = await smsTemplateRepository.findDefault(shopDomain, channelType);
        if (tmpl?.content) template = tmpl.content;
      } catch {
        // Use default template on failure
      }
    }

    // 11. Set resend cooldown before firing SMS
    await otpRateLimiter.setResendCooldown(shopDomain, destination, resendDelay).catch(() => {});

    // 12. Fire SMS in background — OTP is already stored, don't block the response
    const smsVariables = {
      store: shopDoc.shopName ?? shopDomain,
      phone: maskedDestination,
      appName: env.APP_NAME,
    };

    void providerResolver.sendOtp(
      shopDomain,
      destination,
      generated.code,
      template,
      smsVariables
    ).then((smsResult) => {
      if (!smsResult.success) {
        const errMsg = smsResult.errorMessage ?? "SMS delivery failed";
        console.error(`[OtpService] SMS send failed for ${shopDomain}: ${errMsg}`);
        void otpLogRepository.updateStatus(generated.requestId, "failed", {
          errorCode: "SMS_SEND_FAILED",
          errorMessage: errMsg,
        }).catch(() => {});
        void analyticsService.record(shopDomain, { otpFailed: 1, smsFailed: 1 });
      } else {
        console.info(`[OtpService] SMS sent for ${shopDomain} via ${smsResult.provider}`);
        void otpLogRepository.updateStatus(generated.requestId, "sent", {
          smsProvider: smsResult.providerName ?? smsResult.provider,
          smsSid: smsResult.messageId,
        }).catch(() => {});
      }
    }).catch((err) => {
      console.error(`[OtpService] SMS send threw for ${shopDomain}:`, err);
    });

    // 13. Record analytics (fire-and-forget)
    void analyticsService.record(shopDomain, { otpRequested: 1 }, countryCode);

    return serviceSuccess({
      requestId: generated.requestId,
      expiresAt: generated.expiresAt,
      resendDelay,
      maskedDestination,
      channel,
      otpLength,
    });
  }

  /**
   * Verifies a submitted OTP code against the stored hash.
   * Deletes the Redis entry on success.
   */
  async verify(req: OtpVerifyRequest): Promise<ServiceResult<OtpVerifyResponse>> {
    const { shopDomain, requestId, code, ipAddress } = req;

    if (!code || code.trim() === "") {
      return serviceFailure("OTP code is required", 400);
    }

    // 1. Load from Redis
    const entry = await otpStore.get(shopDomain, requestId);

    if (!entry) {
      return serviceFailure("OTP has expired or is invalid. Please request a new one.", 410);
    }

    // 2. Check expiry
    if (entry.expiresAt < Date.now()) {
      await otpStore.delete(shopDomain, requestId);
      await otpLogRepository.updateStatus(requestId, "expired").catch(() => {});
      void analyticsService.record(shopDomain, { otpExpired: 1 });
      return serviceFailure("OTP has expired. Please request a new one.", 410);
    }

    // 3. Check if already at max attempts BEFORE incrementing
    if (entry.attempts >= entry.maxAttempts) {
      await otpStore.delete(shopDomain, requestId);
      await otpLogRepository.updateStatus(requestId, "blocked").catch(() => {});
      void analyticsService.record(shopDomain, { otpBlocked: 1 });
      return serviceFailure(
        "Maximum verification attempts exceeded. Please request a new OTP.",
        429
      );
    }

    // 4. Increment attempts atomically
    const newAttempts = await otpStore.incrementAttempts(shopDomain, requestId);
    await otpLogRepository.incrementAttempts(requestId).catch(() => {});

    // 5. Hash the submitted code with the stored salt
    const submittedHash = hashOtp(code.trim(), entry.salt);

    // 6. Timing-safe comparison
    const isValid = timingSafeEqual(entry.hash, submittedHash);

    if (isValid) {
      // 7a. Success path
      await otpStore.delete(shopDomain, requestId);
      await otpLogRepository.updateStatus(requestId, "verified").catch(() => {});
      void analyticsService.record(shopDomain, { otpVerified: 1 });

      return serviceSuccess({
        verified: true,
        phone: entry.phone,
        email: entry.email,
        channel: entry.channel,
      });
    }

    // 7b. Failure path
    const remainingAttempts = entry.maxAttempts - newAttempts;

    if (remainingAttempts <= 0) {
      await otpStore.delete(shopDomain, requestId);
      await otpLogRepository.updateStatus(requestId, "blocked").catch(() => {});
      void analyticsService.record(shopDomain, { otpFailed: 1, otpBlocked: 1 });
      return serviceFailure(
        "Maximum verification attempts exceeded. Please request a new OTP.",
        429
      );
    }

    void analyticsService.record(shopDomain, { otpFailed: 1 });
    return serviceFailure(
      `Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`,
      422
    );
  }

  /**
   * Resends the OTP by invalidating the old Redis entry and issuing a new one
   * with the same destination and channel settings.
   */
  async resend(req: OtpResendRequest): Promise<ServiceResult<OtpResendResponse>> {
    const { shopDomain, requestId, ipAddress } = req;

    // 1. Load old entry from Redis
    const oldEntry = await otpStore.get(shopDomain, requestId);
    if (!oldEntry) {
      return serviceFailure("Original OTP request not found. Please start over.", 404);
    }

    const destination = oldEntry.phone ?? oldEntry.email ?? "";

    // 2. Check resend cooldown
    const cooldown = await otpRateLimiter.checkResendCooldown(shopDomain, destination);
    if (!cooldown.allowed) {
      return serviceFailure(
        `Please wait ${cooldown.ttlSeconds} seconds before resending.`,
        429
      );
    }

    // 3. Delete old entry from Redis
    await otpStore.delete(shopDomain, requestId);

    // 4. Generate new OTP
    const shop = await shopRepository.findByDomain(shopDomain);
    const otpLength = shop?.settings?.otpLength ?? 6;
    const otpExpiry = shop?.settings?.otpExpiry ?? 120;
    const maxAttempts = shop?.settings?.maxAttempts ?? 5;
    const resendDelay = shop?.settings?.resendDelay ?? 30;

    const generated = createOtp(otpLength as 4 | 5 | 6 | 8, otpExpiry);

    // 5. Store new entry
    await otpStore.store(
      shopDomain,
      generated.requestId,
      {
        hash: generated.hash,
        salt: generated.salt,
        maxAttempts,
        expiresAt: generated.expiresAt.getTime(),
        phone: oldEntry.phone,
        email: oldEntry.email,
        channel: oldEntry.channel,
      },
      otpExpiry + 30
    );

    // 6. Update old OtpLog to expired, create new OtpLog
    await otpLogRepository.updateStatus(requestId, "expired").catch(() => {});
    await otpLogRepository.create({
      shopDomain,
      phone: oldEntry.phone,
      email: oldEntry.email,
      channel: oldEntry.channel,
      status: "pending",
      ipAddress,
      userAgent: "",
      otpLength,
      expirySeconds: otpExpiry,
      maxAttempts,
      requestId: generated.requestId,
      expiresAt: generated.expiresAt,
    } as Parameters<typeof otpLogRepository.create>[0]).catch(() => {});

    // 7. Load template and send SMS directly
    let template = defaultOtpTemplate(otpExpiry);
    try {
      const tmpl = await smsTemplateRepository.findDefault(shopDomain, "login");
      if (tmpl?.content) template = tmpl.content;
    } catch {/* use default */}

    const maskedDest = oldEntry.phone
      ? maskPhone(oldEntry.phone)
      : maskEmail(oldEntry.email ?? "");

    await otpRateLimiter.setResendCooldown(shopDomain, destination, resendDelay).catch(() => {});

    void providerResolver.sendOtp(
      shopDomain,
      destination,
      generated.code,
      template,
      {
        store: shop?.shopName ?? shopDomain,
        phone: maskedDest,
        appName: env.APP_NAME,
      }
    ).then((smsResult) => {
      if (!smsResult.success) {
        const errMsg = smsResult.errorMessage ?? "SMS delivery failed";
        console.error(`[OtpService] Resend SMS failed for ${shopDomain}: ${errMsg}`);
        void otpLogRepository.updateStatus(generated.requestId, "failed", {
          errorCode: "SMS_SEND_FAILED",
          errorMessage: errMsg,
        }).catch(() => {});
      } else {
        void otpLogRepository.updateStatus(generated.requestId, "sent", {
          smsProvider: smsResult.providerName ?? smsResult.provider,
          smsSid: smsResult.messageId,
        }).catch(() => {});
      }
    }).catch((err) => {
      console.error(`[OtpService] Resend SMS threw for ${shopDomain}:`, err);
    });

    void analyticsService.record(shopDomain, { otpRequested: 1 });

    return serviceSuccess({
      requestId: generated.requestId,
      expiresAt: generated.expiresAt,
      resendDelay,
      maskedDestination: maskedDest,
    });
  }
}

export const otpService = new OtpService();
