import type { SessionStorage } from "@shopify/shopify-app-remix/server";
import type { Session } from "@shopify/shopify-api";
import { sessionService } from "~/services/session.service";

/**
 * MongoDB-backed SessionStorage for Shopify OAuth sessions.
 * Implements the SessionStorage interface from @shopify/shopify-api.
 * Sessions are stored in the `sessions` collection with TTL indexing
 * for automatic expiry cleanup.
 */
export class MongoSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const result = await sessionService.storeSession(session);
    if (!result.success) {
      console.error(
        "[MongoSessionStorage] storeSession failed",
        result.error
      );
      return false;
    }
    return result.data ?? false;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const result = await sessionService.loadSession(id);
    if (!result.success) {
      console.error(
        "[MongoSessionStorage] loadSession failed",
        result.error
      );
      return undefined;
    }
    return result.data;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await sessionService.deleteSession(id);
    if (!result.success) {
      console.error(
        "[MongoSessionStorage] deleteSession failed",
        result.error
      );
      return false;
    }
    return result.data ?? false;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    const result = await sessionService.deleteSessions(ids);
    if (!result.success) {
      console.error(
        "[MongoSessionStorage] deleteSessions failed",
        result.error
      );
      return false;
    }
    return result.data ?? false;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const result = await sessionService.findSessionsByShop(shop);
    if (!result.success || !result.data) {
      return [];
    }
    return result.data;
  }
}
