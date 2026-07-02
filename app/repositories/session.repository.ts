import { BaseRepository } from "./base.repository";
import SessionModel, { type ISessionDocument } from "~/models/session.model";
import connectToDatabase from "~/config/database";
import type { ISession } from "~/types/session.types";

export class SessionRepository extends BaseRepository<ISessionDocument> {
  constructor() {
    super(SessionModel);
  }

  async findBySessionId(id: string): Promise<ISessionDocument | null> {
    await connectToDatabase();
    return this.model.findById(id).select("+accessToken").exec();
  }

  async upsertSession(session: ISession): Promise<ISessionDocument> {
    await connectToDatabase();

    const setData: Record<string, unknown> = {
      shop: session.shop.toLowerCase(),
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires,
      accessToken: session.accessToken,
      onlineAccessInfo: session.onlineAccessInfo,
    };

    if (session.onlineAccessInfo?.associatedUser) {
      const u = session.onlineAccessInfo.associatedUser;
      setData.userId = String(u.id);
      setData.firstName = u.firstName;
      setData.lastName = u.lastName;
      setData.email = u.email;
      setData.accountOwner = u.accountOwner;
      setData.locale = u.locale;
      setData.collaborator = u.collaborator;
      setData.emailVerified = u.emailVerified;
    }

    const doc = await this.model
      .findByIdAndUpdate(
        session.id,
        { $set: setData },
        { new: true, upsert: true }
      )
      .select("+accessToken")
      .exec();

    if (!doc) {
      throw new Error(`Failed to upsert session: ${session.id}`);
    }

    return doc;
  }

  async findSessionsByShop(shop: string): Promise<ISessionDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ shop: shop.toLowerCase() })
      .select("+accessToken")
      .exec();
  }

  async deleteBySessionId(id: string): Promise<boolean> {
    await connectToDatabase();
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async deleteSessionsByShop(shop: string): Promise<number> {
    await connectToDatabase();
    const result = await this.model
      .deleteMany({ shop: shop.toLowerCase() })
      .exec();
    return result.deletedCount;
  }
}

export const sessionRepository = new SessionRepository();
