import { BaseRepository } from "./base.repository";
import CustomerModel, { type ICustomerDocument } from "~/models/customer.model";
import connectToDatabase from "~/config/database";
import type { CustomerCreateInput } from "~/types/customer.types";

export class CustomerRepository extends BaseRepository<ICustomerDocument> {
  constructor() {
    super(CustomerModel);
  }

  async findByShopifyId(
    shopDomain: string,
    shopifyCustomerId: string
  ): Promise<ICustomerDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase(), shopifyCustomerId })
      .exec();
  }

  async findByPhone(
    shopDomain: string,
    phone: string
  ): Promise<ICustomerDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase(), phoneNormalized: phone })
      .exec();
  }

  async findByEmail(
    shopDomain: string,
    email: string
  ): Promise<ICustomerDocument | null> {
    await connectToDatabase();
    return this.model
      .findOne({ shopDomain: shopDomain.toLowerCase(), email: email.toLowerCase() })
      .exec();
  }

  async upsertByShopifyId(
    data: CustomerCreateInput
  ): Promise<ICustomerDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        {
          shopDomain: data.shopDomain.toLowerCase(),
          shopifyCustomerId: data.shopifyCustomerId,
        },
        { $set: { ...data, shopDomain: data.shopDomain.toLowerCase() } },
        { new: true, upsert: true, runValidators: true }
      )
      .exec();
    if (!doc) throw new Error("Failed to upsert customer");
    return doc;
  }

  async incrementLoginCount(
    shopDomain: string,
    shopifyCustomerId: string
  ): Promise<void> {
    await connectToDatabase();
    await this.model
      .updateOne(
        { shopDomain: shopDomain.toLowerCase(), shopifyCustomerId },
        {
          $inc: { loginCount: 1, totalOtpRequests: 1 },
          $set: { lastLoginAt: new Date() },
        }
      )
      .exec();
  }

  async markPhoneVerified(
    shopDomain: string,
    shopifyCustomerId: string,
    channel: "sms" | "email" | "whatsapp"
  ): Promise<ICustomerDocument | null> {
    await connectToDatabase();
    return this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase(), shopifyCustomerId },
        {
          $set: {
            isPhoneVerified: true,
            phoneVerifiedAt: new Date(),
            verificationChannel: channel,
          },
        },
        { new: true }
      )
      .exec();
  }

  async blockCustomer(
    shopDomain: string,
    shopifyCustomerId: string,
    reason: string
  ): Promise<ICustomerDocument | null> {
    await connectToDatabase();
    return this.model
      .findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase(), shopifyCustomerId },
        {
          $set: {
            isBlocked: true,
            blockedReason: reason,
            blockedAt: new Date(),
          },
        },
        { new: true }
      )
      .exec();
  }
}

export const customerRepository = new CustomerRepository();
