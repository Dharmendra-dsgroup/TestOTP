/**
 * SMS Provider Resolver with automatic failover.
 *
 * Load order: primary → secondary → fallback
 *
 * On each send attempt:
 * 1. Load the shop's active providers from DB (ordered by role priority)
 * 2. Decrypt credentials for each
 * 3. Attempt primary first; if it fails, try secondary; then fallback
 * 4. Update DB health flags on failure / recovery
 * 5. Return the first successful SmsResult or the last failure
 *
 * The DefaultProvider is always appended as a last-resort fallback in
 * development/test so the flow never hard-errors in the absence of a configured
 * provider.
 */

import type { ISmsProvider, SmsResult } from "./interfaces/sms-provider.interface";
import { createProvider } from "./provider-factory.server";
import { DefaultProvider } from "./providers/default.provider";
import { smsProviderRepository } from "~/repositories/sms-provider.repository";
import { decrypt } from "~/utils/crypto";
import { env } from "~/config/env";
import type { SmsProviderCredentials } from "~/types/sms.types";

export interface ResolvedSendResult extends SmsResult {
  providerName?: string;
  failoverChain?: string[];
}

export class ProviderResolver {
  /**
   * Sends an OTP via the shop's configured SMS provider chain.
   * Automatically fails over from primary → secondary → fallback.
   */
  async sendOtp(
    shopDomain: string,
    to: string,
    otp: string,
    template: string,
    variables: Record<string, string> = {}
  ): Promise<ResolvedSendResult> {
    const providers = await this.loadProviders(shopDomain);
    const failoverChain: string[] = [];
    let lastResult: SmsResult | null = null;

    for (const { provider, dbId, name } of providers) {
      failoverChain.push(name);

      const result = await provider.sendOTP(to, otp, template, variables);

      if (result.success) {
        // Mark healthy if previously unhealthy
        if (dbId) {
          await smsProviderRepository.markHealthy(dbId).catch(() => {});
          await smsProviderRepository.incrementSentCount(dbId).catch(() => {});
        }

        return {
          ...result,
          providerName: name,
          failoverChain,
        };
      }

      // Record failure
      lastResult = result;
      if (dbId) {
        await smsProviderRepository.markUnhealthy(dbId, result.errorMessage ?? "Send failed").catch(() => {});
        await smsProviderRepository.incrementFailedCount(dbId).catch(() => {});
      }
    }

    // All providers failed
    return {
      success: false,
      errorMessage: lastResult?.errorMessage ?? "All SMS providers failed",
      errorCode: lastResult?.errorCode,
      provider: lastResult?.provider ?? "default",
      providerName: failoverChain.join(" → "),
      failoverChain,
    };
  }

  /**
   * Builds the ordered provider list for a shop.
   * Falls back to DefaultProvider if no providers are configured.
   */
  private async loadProviders(
    shopDomain: string
  ): Promise<{ provider: ISmsProvider; dbId?: string; name: string }[]> {
    try {
      const docs = await smsProviderRepository.findByShopWithCredentials(shopDomain);

      if (!docs.length) {
        return [{ provider: new DefaultProvider(), name: "Default" }];
      }

      const result: { provider: ISmsProvider; dbId?: string; name: string }[] = [];

      for (const doc of docs) {
        try {
          if (!doc.credentialsEncrypted) continue;

          const decrypted = decrypt(doc.credentialsEncrypted, env.ENCRYPTION_KEY);
          const credentials: SmsProviderCredentials = JSON.parse(decrypted);

          const provider = createProvider(doc.type, credentials, doc.name);
          result.push({
            provider,
            dbId: doc._id.toString(),
            name: doc.name,
          });
        } catch (err) {
          // Skip providers with malformed credentials; log but don't crash
          console.error(
            `[ProviderResolver] Failed to load provider "${doc.name}": ${
              err instanceof Error ? err.message : "unknown"
            }`
          );
        }
      }

      // Always append DefaultProvider as last-resort in non-production environments
      if (process.env.NODE_ENV !== "production") {
        result.push({ provider: new DefaultProvider(), name: "Default (fallback)" });
      }

      return result.length ? result : [{ provider: new DefaultProvider(), name: "Default" }];
    } catch (err) {
      console.error("[ProviderResolver] Failed to load providers:", err);
      return [{ provider: new DefaultProvider(), name: "Default" }];
    }
  }
}

export const providerResolver = new ProviderResolver();
