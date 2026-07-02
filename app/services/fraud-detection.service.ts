/**
 * FraudDetectionService — centralized security evaluation for every OTP request.
 *
 * Evaluation order (fail-fast, cheapest checks first):
 *   1. Explicit IP blocklist (DB — always enforced regardless of plan)
 *   2. Explicit phone/email blocklist (DB — always enforced)
 *   3. Country block (in-memory from shop settings)
 *   4. Email domain block (in-memory from shop settings)
 *   5. IP velocity (Redis — requires fraudDetectionEnabled)
 *   6. Phone/email velocity (Redis — requires fraudDetectionEnabled)
 *   7. Auto-block IP after threshold (Redis counter → DB upsert)
 *
 * All block events are logged to SecurityEvent collection.
 * Services NEVER throw — returns ServiceResult<FraudDecision>.
 */

import { getRedisClient } from "~/config/redis";
import { blockedIpRepository } from "~/repositories/blocked-ip.repository";
import { blockedNumberRepository } from "~/repositories/blocked-number.repository";
import { securityEventRepository } from "~/repositories/security-event.repository";
import { shopRepository } from "~/repositories/shop.repository";
import { maskPhone, maskEmail } from "~/utils/phone";
import {
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "~/types/common.types";
import type {
  FraudEvaluateInput,
  FraudDecision,
  SecurityEventType,
  SecurityEventSeverity,
} from "~/types/security.types";

// ─── Redis key builders ───────────────────────────────────────────────────────

function ipVelocityKey(
  shopDomain: string,
  ipAddress: string,
  windowBucket: number
): string {
  return `fd:ipv:${shopDomain}:${ipAddress}:${windowBucket}`;
}

function phoneVelocityKey(
  shopDomain: string,
  value: string,
  windowBucket: number
): string {
  return `fd:phv:${shopDomain}:${value}:${windowBucket}`;
}

function autoBlockCounterKey(
  shopDomain: string,
  ipAddress: string,
  dayBucket: string
): string {
  return `fd:ab:${shopDomain}:${ipAddress}:${dayBucket}`;
}

function windowBucket(windowSeconds: number): number {
  return Math.floor(Date.now() / (windowSeconds * 1000));
}

function todayBucket(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FraudDetectionService {
  /**
   * Evaluates an incoming OTP request for fraud signals.
   *
   * @returns ServiceResult<FraudDecision> — success.data.allowed = false means block the request.
   *
   * Non-critical errors (e.g. Redis unavailable) are treated as pass-through
   * to avoid blocking legitimate users when the fraud system is down.
   */
  async evaluate(
    shopDomain: string,
    input: FraudEvaluateInput
  ): Promise<ServiceResult<FraudDecision>> {
    try {
      const { phone, email, ipAddress, country } = input;
      const shop = shopDomain.toLowerCase();

      // ── 1. IP blocklist (always enforced) ──────────────────────────────────
      const ipBlocked = await blockedIpRepository.isBlocked(shop, ipAddress);
      if (ipBlocked) {
        await this._logEvent(shop, {
          type: "ip_blocked",
          severity: "high",
          ipAddress,
          signal: "IP address is on the store blocklist",
          recipientMasked: phone ? maskPhone(phone) : email ? maskEmail(email) : undefined,
          recipientType: phone ? "phone" : email ? "email" : undefined,
          country,
        });
        return serviceSuccess({
          allowed: false,
          reason: "Your IP address has been blocked from using this service.",
          signal: "ip_blocked",
          severity: "high",
        });
      }

      // ── 2. Phone / email blocklist (always enforced) ───────────────────────
      if (phone) {
        const phoneBlocked = await blockedNumberRepository.isBlocked(shop, phone);
        if (phoneBlocked) {
          await this._logEvent(shop, {
            type: "phone_blocked",
            severity: "high",
            ipAddress,
            signal: "Phone number is on the store blocklist",
            recipientMasked: maskPhone(phone),
            recipientType: "phone",
            country,
          });
          return serviceSuccess({
            allowed: false,
            reason: "This phone number is not allowed to use this service.",
            signal: "phone_blocked",
            severity: "high",
          });
        }
      }

      // ── 3–6 require shop settings ──────────────────────────────────────────
      const shopDoc = await shopRepository.findByDomain(shop);
      if (!shopDoc) {
        // Shop not found — let OTP service handle this error
        return serviceSuccess({ allowed: true });
      }

      const settings = shopDoc.settings;

      // ── 3. Country block (always enforced when blockedCountries configured) ─
      if (country && settings.blockedCountries?.length > 0) {
        if (settings.blockedCountries.includes(country.toUpperCase())) {
          await this._logEvent(shop, {
            type: "country_blocked",
            severity: "medium",
            ipAddress,
            signal: `Country ${country} is blocked`,
            recipientMasked: phone ? maskPhone(phone) : email ? maskEmail(email) : undefined,
            recipientType: phone ? "phone" : email ? "email" : undefined,
            country,
          });
          return serviceSuccess({
            allowed: false,
            reason: "OTP service is not available in your country.",
            signal: "country_blocked",
            severity: "medium",
          });
        }
      }

      // ── 4. Email domain block ────────────────────────────────────────────────
      if (email) {
        const domain = email.split("@")[1]?.toLowerCase();
        const blockedDomains: string[] = (settings as Record<string, unknown>).blockedEmailDomains as string[] ?? [];
        if (domain && blockedDomains.includes(domain)) {
          await this._logEvent(shop, {
            type: "email_domain_blocked",
            severity: "medium",
            ipAddress,
            signal: `Email domain ${domain} is blocked`,
            recipientMasked: maskEmail(email),
            recipientType: "email",
            country,
          });
          return serviceSuccess({
            allowed: false,
            reason: "Email addresses from this domain are not allowed.",
            signal: "email_domain_blocked",
            severity: "medium",
          });
        }
      }

      // ── 5–7. Velocity checks (require fraudDetectionEnabled) ───────────────
      const fraudEnabled =
        (settings as Record<string, unknown>).fraudDetectionEnabled as boolean ?? false;
      if (!fraudEnabled) {
        return serviceSuccess({ allowed: true });
      }

      const ipWindowMinutes =
        ((settings as Record<string, unknown>).ipVelocityWindowMinutes as number) ?? 60;
      const ipLimit =
        ((settings as Record<string, unknown>).ipVelocityLimit as number) ?? 20;
      const phoneWindowMinutes =
        ((settings as Record<string, unknown>).phoneVelocityWindowMinutes as number) ?? 60;
      const phoneLimit =
        ((settings as Record<string, unknown>).phoneVelocityLimit as number) ?? 5;
      const autoBlockEnabled =
        ((settings as Record<string, unknown>).autoBlockEnabled as boolean) ?? false;
      const autoBlockThreshold =
        ((settings as Record<string, unknown>).autoBlockThreshold as number) ?? 50;

      // ── 5. IP velocity ───────────────────────────────────────────────────────
      const ipVelocityResult = await this._checkVelocity(
        ipVelocityKey(shop, ipAddress, windowBucket(ipWindowMinutes * 60)),
        ipWindowMinutes * 60 + 60,
        ipLimit
      );

      if (ipVelocityResult.exceeded) {
        await this._logEvent(shop, {
          type: "ip_velocity_exceeded",
          severity: "high",
          ipAddress,
          signal: `IP sent ${ipVelocityResult.count} requests in ${ipWindowMinutes} minutes (limit: ${ipLimit})`,
          recipientMasked: phone ? maskPhone(phone) : email ? maskEmail(email) : undefined,
          recipientType: phone ? "phone" : email ? "email" : undefined,
          country,
          metadata: { count: ipVelocityResult.count, limit: ipLimit, windowMinutes: ipWindowMinutes },
        });

        // Auto-block IP if threshold met
        if (autoBlockEnabled) {
          const autoBlocked = await this._checkAutoBlock(
            shop,
            ipAddress,
            autoBlockThreshold
          );
          if (autoBlocked) {
            await this._logEvent(shop, {
              type: "auto_blocked_ip",
              severity: "critical",
              ipAddress,
              signal: `IP auto-blocked after ${autoBlockThreshold} velocity violations`,
              country,
            });
          }
        }

        return serviceSuccess({
          allowed: false,
          reason: "Too many requests from your location. Please try again later.",
          signal: "ip_velocity_exceeded",
          severity: "high",
        });
      }

      // ── 6. Phone / email velocity ────────────────────────────────────────────
      const velocityTarget = phone ?? email;
      if (velocityTarget) {
        const recipientVelocityResult = await this._checkVelocity(
          phoneVelocityKey(shop, velocityTarget, windowBucket(phoneWindowMinutes * 60)),
          phoneWindowMinutes * 60 + 60,
          phoneLimit
        );

        if (recipientVelocityResult.exceeded) {
          const eventType: SecurityEventType = phone
            ? "phone_velocity_exceeded"
            : "phone_velocity_exceeded";
          await this._logEvent(shop, {
            type: eventType,
            severity: "medium",
            ipAddress,
            signal: `Recipient received ${recipientVelocityResult.count} OTPs in ${phoneWindowMinutes} minutes (limit: ${phoneLimit})`,
            recipientMasked: phone ? maskPhone(phone) : maskEmail(email!),
            recipientType: phone ? "phone" : "email",
            country,
            metadata: {
              count: recipientVelocityResult.count,
              limit: phoneLimit,
              windowMinutes: phoneWindowMinutes,
            },
          });
          return serviceSuccess({
            allowed: false,
            reason: phone
              ? "Too many OTP requests for this phone number. Please try again later."
              : "Too many OTP requests for this email address. Please try again later.",
            signal: eventType,
            severity: "medium",
          });
        }
      }

      return serviceSuccess({ allowed: true });
    } catch (err) {
      // Fraud detection failure should NOT block legitimate users.
      // Log and pass through.
      console.error("[FraudDetection] evaluate() error:", err);
      return serviceSuccess({ allowed: true });
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _checkVelocity(
    key: string,
    ttlSeconds: number,
    limit: number
  ): Promise<{ count: number; exceeded: boolean }> {
    const redis = getRedisClient();
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds);
    const results = await pipeline.exec();
    const count = (results?.[0]?.[1] as number) ?? 0;
    return { count, exceeded: count > limit };
  }

  /**
   * Increments the daily auto-block counter for an IP.
   * If it crosses autoBlockThreshold, adds the IP to the blocklist and returns true.
   */
  private async _checkAutoBlock(
    shopDomain: string,
    ipAddress: string,
    threshold: number
  ): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const key = autoBlockCounterKey(shopDomain, ipAddress, todayBucket());
      const pipeline = redis.pipeline();
      pipeline.incr(key);
      pipeline.expire(key, 86400 + 3600); // 1 day + 1hr overlap
      const results = await pipeline.exec();
      const dailyHits = (results?.[0]?.[1] as number) ?? 0;

      if (dailyHits >= threshold) {
        await blockedIpRepository.blockIp(
          shopDomain,
          ipAddress,
          "fraud_detection",
          "auto",
          new Date(Date.now() + 7 * 24 * 3600 * 1000) // 7-day temporary block
        );
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async _logEvent(
    shopDomain: string,
    event: {
      type: SecurityEventType;
      severity: SecurityEventSeverity;
      ipAddress?: string;
      signal: string;
      recipientMasked?: string;
      recipientType?: "phone" | "email";
      country?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      await securityEventRepository.create(shopDomain, event as Parameters<typeof securityEventRepository.create>[1]);
    } catch (err) {
      console.error("[FraudDetection] Failed to log security event:", err);
    }
  }
}

export const fraudDetectionService = new FraudDetectionService();
