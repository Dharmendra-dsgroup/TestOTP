/**
 * SmsProviderService — full lifecycle for a shop's SMS provider configuration.
 *
 * Responsibilities:
 *  - List providers for display (no credentials exposed)
 *  - Add provider (validates plan limit, encrypts credentials, saves)
 *  - Update provider (re-encrypt if credentials changed, keep existing otherwise)
 *  - Delete provider (soft delete via isActive = false)
 *  - Test provider (instantiate with supplied credentials, call health())
 *  - Assign role (primary/secondary/fallback) — clears role from other providers
 *
 * Services NEVER throw. All methods return ServiceResult<T>.
 */

import { createProvider } from "~/lib/sms/provider-factory.server";
import { smsProviderRepository } from "~/repositories/sms-provider.repository";
import { shopRepository } from "~/repositories/shop.repository";
import { encrypt, decrypt } from "~/utils/crypto";
import { getPlan } from "~/config/plans";
import { isFieldSensitive } from "~/config/provider-fields.config";
import {
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "~/types/common.types";
import type { SmsProviderType, SmsProviderRole, SmsProviderCredentials } from "~/types/sms.types";
import type { ISmsProviderDocument } from "~/models/sms-provider.model";
import type { HealthResult } from "~/lib/sms/interfaces/sms-provider.interface";
import { env } from "~/config/env";
import type { PlanKey } from "~/config/plans";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface ProviderListItem {
  id: string;
  name: string;
  type: SmsProviderType;
  role: SmsProviderRole;
  status: string;
  isActive: boolean;
  isHealthy: boolean;
  totalSent: number;
  totalFailed: number;
  successRate: number;
  lastErrorMessage?: string;
  lastErrorAt?: Date;
  lastHealthCheckAt?: Date;
  priority: number;
}

export interface AddProviderInput {
  name: string;
  type: SmsProviderType;
  role: SmsProviderRole;
  credentials: SmsProviderCredentials;
  senderId?: string;
  rateLimitPerMinute?: number;
  priority?: number;
}

export interface UpdateProviderInput {
  name?: string;
  role?: SmsProviderRole;
  /** If any credential key is non-empty, ALL credentials are re-encrypted and saved. */
  credentials?: SmsProviderCredentials;
  senderId?: string;
  rateLimitPerMinute?: number;
  priority?: number;
  isActive?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SmsProviderService {
  /**
   * Returns all providers for the shop with health/stat info but NO credentials.
   */
  async listForShop(shopDomain: string): Promise<ServiceResult<ProviderListItem[]>> {
    try {
      const docs = await smsProviderRepository.findByShopOrdered(shopDomain);
      const items: ProviderListItem[] = docs.map((d) => ({
        id: d._id.toString(),
        name: d.name,
        type: d.type,
        role: d.role,
        status: d.status,
        isActive: d.isActive,
        isHealthy: d.isHealthy,
        totalSent: d.totalSent,
        totalFailed: d.totalFailed,
        successRate: this._successRate(d.totalSent, d.totalFailed),
        lastErrorMessage: d.lastErrorMessage,
        lastErrorAt: d.lastErrorAt,
        lastHealthCheckAt: d.lastHealthCheckAt,
        priority: d.priority,
      }));
      return serviceSuccess(items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Failed to list providers: ${msg}`, 500);
    }
  }

  /**
   * Adds a new SMS provider for the shop.
   * Validates plan limits before saving.
   */
  async addProvider(
    shopDomain: string,
    input: AddProviderInput
  ): Promise<ServiceResult<ProviderListItem>> {
    try {
      // Plan limit check
      const limitCheck = await this._checkProviderLimit(shopDomain);
      if (!limitCheck.success) return limitCheck;

      // Validate credentials can actually build a provider
      const validationResult = this._validateCredentials(input.type, input.credentials);
      if (!validationResult.ok) {
        return serviceFailure(validationResult.message, 400);
      }

      // If this role is already assigned to another provider, clear it
      await this._clearRole(shopDomain, input.role);

      const credentialsEncrypted = encrypt(
        JSON.stringify(input.credentials),
        env.ENCRYPTION_KEY
      );

      const nextPriority = await this._nextPriority(shopDomain);

      const doc = await smsProviderRepository.create({
        shopDomain: shopDomain.toLowerCase(),
        name: input.name,
        type: input.type,
        role: input.role,
        status: "active",
        credentialsEncrypted,
        senderId: input.senderId,
        rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
        priority: input.priority ?? nextPriority,
        isActive: true,
        isHealthy: true,
        totalSent: 0,
        totalFailed: 0,
      } as unknown as ISmsProviderDocument);

      // Sync shop settings to reference new primary/secondary/fallback IDs
      await this._syncShopProviderSettings(shopDomain);

      return serviceSuccess(this._toListItem(doc));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Failed to add provider: ${msg}`, 500);
    }
  }

  /**
   * Updates an existing provider.
   * Credentials are only re-encrypted if any credential value in the input is non-empty.
   */
  async updateProvider(
    shopDomain: string,
    providerId: string,
    input: UpdateProviderInput
  ): Promise<ServiceResult<ProviderListItem>> {
    try {
      const existing = await smsProviderRepository.findByShopWithCredentials(shopDomain)
        .then((docs) => docs.find((d) => d._id.toString() === providerId));

      if (!existing) return serviceFailure("Provider not found", 404);

      const update: Partial<ISmsProviderDocument> = {};

      if (input.name !== undefined) update.name = input.name;
      if (input.senderId !== undefined) update.senderId = input.senderId;
      if (input.rateLimitPerMinute !== undefined) update.rateLimitPerMinute = input.rateLimitPerMinute;
      if (input.priority !== undefined) update.priority = input.priority;
      if (input.isActive !== undefined) update.isActive = input.isActive;

      // Role change: clear new role from other providers
      if (input.role !== undefined && input.role !== existing.role) {
        await this._clearRole(shopDomain, input.role, providerId);
        update.role = input.role;
      }

      // Re-encrypt credentials only if at least one non-empty field supplied
      if (input.credentials) {
        const hasNewCreds = Object.values(input.credentials).some(
          (v) => v !== undefined && v !== ""
        );
        if (hasNewCreds) {
          const validationResult = this._validateCredentials(
            existing.type,
            input.credentials
          );
          if (!validationResult.ok) {
            return serviceFailure(validationResult.message, 400);
          }
          update.credentialsEncrypted = encrypt(
            JSON.stringify(input.credentials),
            env.ENCRYPTION_KEY
          );
        }
      }

      const updated = await smsProviderRepository.updateById(
        providerId,
        update as unknown as ISmsProviderDocument
      );
      if (!updated) return serviceFailure("Provider not found", 404);

      await this._syncShopProviderSettings(shopDomain);
      return serviceSuccess(this._toListItem(updated));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Failed to update provider: ${msg}`, 500);
    }
  }

  /**
   * Soft-deletes a provider (sets isActive = false).
   */
  async deleteProvider(
    shopDomain: string,
    providerId: string
  ): Promise<ServiceResult<void>> {
    try {
      const existing = await smsProviderRepository.findByShopOrdered(shopDomain)
        .then((docs) => docs.find((d) => d._id.toString() === providerId));

      if (!existing) return serviceFailure("Provider not found", 404);

      await smsProviderRepository.updateById(
        providerId,
        { isActive: false } as unknown as ISmsProviderDocument
      );

      await this._syncShopProviderSettings(shopDomain);
      return serviceSuccess(undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Failed to delete provider: ${msg}`, 500);
    }
  }

  /**
   * Tests a provider connection.
   *
   * If credentialsJson is provided, test directly with those credentials
   * (pre-save test). If not, load from the saved provider record.
   */
  async testProvider(
    shopDomain: string,
    providerType: SmsProviderType,
    credentialsJson?: string,
    providerId?: string
  ): Promise<ServiceResult<HealthResult>> {
    try {
      let credentials: SmsProviderCredentials;

      if (credentialsJson) {
        try {
          credentials = JSON.parse(credentialsJson) as SmsProviderCredentials;
        } catch {
          return serviceFailure("Invalid credentials format", 400);
        }
      } else if (providerId) {
        const docs = await smsProviderRepository.findByShopWithCredentials(shopDomain);
        const doc = docs.find((d) => d._id.toString() === providerId);
        if (!doc) return serviceFailure("Provider not found", 404);

        const decrypted = decrypt(doc.credentialsEncrypted, env.ENCRYPTION_KEY);
        credentials = JSON.parse(decrypted) as SmsProviderCredentials;
      } else {
        return serviceFailure("Either credentials or providerId must be supplied", 400);
      }

      const provider = createProvider(providerType, credentials);
      const result = await provider.health();

      // If testing a saved provider, update its health status
      if (providerId) {
        if (result.healthy) {
          await smsProviderRepository.markHealthy(providerId);
        } else {
          await smsProviderRepository.markUnhealthy(
            providerId,
            result.errorMessage ?? "Health check failed"
          );
        }
      }

      return serviceSuccess(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Provider test failed: ${msg}`, 500);
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async _checkProviderLimit(
    shopDomain: string
  ): Promise<ServiceResult<void>> {
    const shopDoc = await shopRepository.findByDomain(shopDomain);
    const planKey = (shopDoc?.billing?.planId ?? "free") as PlanKey;
    const plan = getPlan(planKey);

    if (plan.maxProviders === -1) return serviceSuccess(undefined);

    const existing = await smsProviderRepository.findByShopOrdered(shopDomain);
    if (existing.length >= plan.maxProviders) {
      return serviceFailure(
        `Your ${plan.name} plan allows up to ${plan.maxProviders} SMS provider${plan.maxProviders === 1 ? "" : "s"}. Upgrade to add more.`,
        402
      );
    }
    return serviceSuccess(undefined);
  }

  /** Clears the given role from all providers (except excludeId). */
  private async _clearRole(
    shopDomain: string,
    role: SmsProviderRole,
    excludeId?: string
  ): Promise<void> {
    const docs = await smsProviderRepository.findByShopOrdered(shopDomain);
    for (const doc of docs) {
      if (doc.role === role && doc._id.toString() !== excludeId) {
        await smsProviderRepository.updateById(
          doc._id.toString(),
          { role: "fallback" } as unknown as ISmsProviderDocument
        );
      }
    }
  }

  /** Gets the next available priority value for a new provider. */
  private async _nextPriority(shopDomain: string): Promise<number> {
    const docs = await smsProviderRepository.findByShopOrdered(shopDomain);
    return docs.length > 0
      ? Math.max(...docs.map((d) => d.priority)) + 1
      : 1;
  }

  /**
   * Syncs shop.settings.smsProvider{Primary,Secondary,Fallback} from the
   * current active provider set. This keeps the shop document up to date
   * so the provider resolver doesn't need to re-query.
   */
  private async _syncShopProviderSettings(shopDomain: string): Promise<void> {
    try {
      const docs = await smsProviderRepository.findByShopOrdered(shopDomain);
      const byRole = (role: SmsProviderRole) =>
        docs.find((d) => d.role === role)?._id.toString();

      await shopRepository.updateSettings(shopDomain, {
        smsProviderPrimary: byRole("primary"),
        smsProviderSecondary: byRole("secondary"),
        smsProviderFallback: byRole("fallback"),
      });
    } catch {
      // Non-critical — log but don't fail the operation
    }
  }

  private _validateCredentials(
    type: SmsProviderType,
    credentials: SmsProviderCredentials
  ): { ok: boolean; message: string } {
    // Basic: try instantiating the provider — it will throw on missing required fields
    try {
      createProvider(type, credentials);
      return { ok: true, message: "" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      return { ok: false, message: msg };
    }
  }

  private _toListItem(doc: ISmsProviderDocument): ProviderListItem {
    return {
      id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      role: doc.role,
      status: doc.status,
      isActive: doc.isActive,
      isHealthy: doc.isHealthy,
      totalSent: doc.totalSent,
      totalFailed: doc.totalFailed,
      successRate: this._successRate(doc.totalSent, doc.totalFailed),
      lastErrorMessage: doc.lastErrorMessage,
      lastErrorAt: doc.lastErrorAt,
      lastHealthCheckAt: doc.lastHealthCheckAt,
      priority: doc.priority,
    };
  }

  private _successRate(sent: number, failed: number): number {
    const total = sent + failed;
    if (total === 0) return 100;
    return Math.round(((total - failed) / total) * 1000) / 10; // 1 decimal
  }
}

export const smsProviderService = new SmsProviderService();
