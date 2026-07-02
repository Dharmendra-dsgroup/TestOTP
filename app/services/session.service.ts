import { Session } from "@shopify/shopify-api";
import { sessionRepository } from "~/repositories/session.repository";
import type { ISession } from "~/types/session.types";
import {
  type ServiceResult,
  serviceSuccess,
  serviceFailure,
} from "~/types/common.types";

export class SessionService {
  private toISession(session: Session): ISession {
    return {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires,
      accessToken: session.accessToken,
      onlineAccessInfo: session.onlineAccessInfo as ISession["onlineAccessInfo"],
    };
  }

  private toSession(id: string, doc: {
    shop: string;
    state: string;
    isOnline: boolean;
    scope?: string;
    expires?: Date;
    accessToken?: string;
    onlineAccessInfo?: ISession["onlineAccessInfo"];
  }): Session {
    const session = new Session({
      id,
      shop: doc.shop,
      state: doc.state,
      isOnline: doc.isOnline,
    });

    if (doc.scope !== undefined) session.scope = doc.scope;
    if (doc.expires !== undefined) session.expires = doc.expires;
    if (doc.accessToken !== undefined) session.accessToken = doc.accessToken;
    if (doc.onlineAccessInfo !== undefined) {
      session.onlineAccessInfo = doc.onlineAccessInfo as Session["onlineAccessInfo"];
    }

    return session;
  }

  async storeSession(session: Session): Promise<ServiceResult<boolean>> {
    try {
      await sessionRepository.upsertSession(this.toISession(session));
      return serviceSuccess(true);
    } catch (error) {
      console.error("[SessionService] storeSession failed:", error);
      return serviceFailure("Failed to store session", 500);
    }
  }

  async loadSession(
    id: string
  ): Promise<ServiceResult<Session | undefined>> {
    try {
      const doc = await sessionRepository.findBySessionId(id);
      if (!doc) {
        return serviceSuccess(undefined);
      }

      const session = this.toSession(doc._id as string, {
        shop: doc.shop,
        state: doc.state,
        isOnline: doc.isOnline,
        scope: doc.scope,
        expires: doc.expires,
        accessToken: doc.accessToken,
        onlineAccessInfo: doc.onlineAccessInfo,
      });

      return serviceSuccess(session);
    } catch (error) {
      console.error("[SessionService] loadSession failed:", error);
      return serviceFailure("Failed to load session", 500);
    }
  }

  async deleteSession(id: string): Promise<ServiceResult<boolean>> {
    try {
      const deleted = await sessionRepository.deleteBySessionId(id);
      return serviceSuccess(deleted);
    } catch (error) {
      console.error("[SessionService] deleteSession failed:", error);
      return serviceFailure("Failed to delete session", 500);
    }
  }

  async deleteSessions(ids: string[]): Promise<ServiceResult<boolean>> {
    try {
      const results = await Promise.allSettled(
        ids.map((id) => sessionRepository.deleteBySessionId(id))
      );
      const allDeleted = results.every(
        (r) => r.status === "fulfilled"
      );
      return serviceSuccess(allDeleted);
    } catch (error) {
      console.error("[SessionService] deleteSessions failed:", error);
      return serviceFailure("Failed to delete sessions", 500);
    }
  }

  async findSessionsByShop(
    shop: string
  ): Promise<ServiceResult<Session[]>> {
    try {
      const docs = await sessionRepository.findSessionsByShop(shop);
      const sessions = docs.map((doc) =>
        this.toSession(doc._id as string, {
          shop: doc.shop,
          state: doc.state,
          isOnline: doc.isOnline,
          scope: doc.scope,
          expires: doc.expires,
          accessToken: doc.accessToken,
          onlineAccessInfo: doc.onlineAccessInfo,
        })
      );
      return serviceSuccess(sessions);
    } catch (error) {
      console.error("[SessionService] findSessionsByShop failed:", error);
      return serviceFailure("Failed to find sessions", 500);
    }
  }

  async deleteSessionsForShop(shop: string): Promise<ServiceResult<number>> {
    try {
      const count = await sessionRepository.deleteSessionsByShop(shop);
      return serviceSuccess(count);
    } catch (error) {
      console.error("[SessionService] deleteSessionsForShop failed:", error);
      return serviceFailure("Failed to delete sessions for shop", 500);
    }
  }
}

export const sessionService = new SessionService();
