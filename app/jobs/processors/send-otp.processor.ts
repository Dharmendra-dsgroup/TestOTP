/**
 * BullMQ processor for the "send-otp" job.
 *
 * Responsibilities:
 * 1. Validate the job is still relevant (not expired, OTP still in Redis)
 * 2. Decrypt the OTP code
 * 3. Render the SMS template
 * 4. Send via ProviderResolver (primary → secondary → fallback)
 * 5. Update OtpLog status in MongoDB
 * 6. Record analytics (fire-and-forget)
 */

import type { Job } from "bullmq";
import { decrypt } from "~/utils/crypto";
import { env } from "~/config/env";
import { otpStore } from "~/lib/otp/otp-store.server";
import { providerResolver } from "~/lib/sms/provider-resolver.server";
import { renderTemplate, defaultOtpTemplate } from "~/lib/templates/sms-template.renderer";
import { otpLogRepository } from "~/repositories/otp-log.repository";
import { analyticsService } from "~/services/analytics.service";
import type { SendOtpJobData, SendOtpJobResult } from "~/jobs/types";

export async function sendOtpProcessor(
  job: Job<SendOtpJobData>
): Promise<SendOtpJobResult> {
  const data = job.data;
  const { requestId, shopDomain, otpEncrypted, template, variables, expiresAt } = data;

  // 1. Check expiry — don't send stale OTPs
  if (new Date(expiresAt) < new Date()) {
    await otpLogRepository.updateStatus(requestId, "expired").catch(() => {});
    void analyticsService.record(shopDomain, { otpExpired: 1 });
    return { success: false, errorMessage: "OTP expired before delivery" };
  }

  // 2. Verify OTP still exists in Redis (not already verified or manually deleted)
  const exists = await otpStore.exists(shopDomain, requestId);
  if (!exists) {
    // OTP was already verified or deleted — don't send
    return { success: false, errorMessage: "OTP no longer active in cache" };
  }

  // 3. Decrypt the OTP code
  let otp: string;
  try {
    otp = decrypt(otpEncrypted, env.ENCRYPTION_KEY);
  } catch {
    await otpLogRepository.updateStatus(requestId, "failed", {
      errorCode: "DECRYPT_ERROR",
      errorMessage: "Failed to decrypt OTP for delivery",
    }).catch(() => {});
    return { success: false, errorMessage: "Decryption failed" };
  }

  // 4. Resolve destination and template
  const { phone, email, channel } = data;
  const destination = phone ?? email ?? "";
  const finalTemplate = template || defaultOtpTemplate(120);
  const finalVariables = { ...variables, otp };

  // 5. Send via provider chain
  let result: Awaited<ReturnType<typeof providerResolver.sendOtp>>;

  if (channel === "sms" || channel === "whatsapp") {
    result = await providerResolver.sendOtp(
      shopDomain,
      destination,
      otp,
      finalTemplate,
      finalVariables
    );
  } else {
    // Email / voice channels — not yet implemented, mark as failed
    result = {
      success: false,
      errorMessage: `Channel "${channel}" delivery not yet implemented`,
      provider: "default",
    };
  }

  // 6. Update OtpLog
  if (result.success) {
    await otpLogRepository.updateStatus(requestId, "sent", {
      smsProvider: result.providerName ?? result.provider,
      smsSid: result.messageId,
      smsCost: result.cost,
    }).catch(() => {});

    void analyticsService.record(shopDomain, {
      otpSent: 1,
      smsDelivered: channel === "sms" ? 1 : 0,
    });
  } else {
    // Final failure (BullMQ has exhausted all retries when this is the last attempt)
    if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
      await otpLogRepository.updateStatus(requestId, "failed", {
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      }).catch(() => {});

      void analyticsService.record(shopDomain, {
        otpFailed: 1,
        smsFailed: channel === "sms" ? 1 : 0,
      });
    }

    // Throw so BullMQ retries
    throw new Error(result.errorMessage ?? "SMS delivery failed");
  }

  return {
    success: true,
    messageId: result.messageId,
    provider: result.providerName ?? result.provider,
    failoverChain: result.failoverChain,
    latencyMs: result.latencyMs,
  };
}
