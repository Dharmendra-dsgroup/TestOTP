import { BaseRepository } from "./base.repository";
import PlanModel, { type IPlanDocument } from "~/models/plan.model";
import connectToDatabase from "~/config/database";
import type { PlanId } from "~/types/billing.types";

export class PlanRepository extends BaseRepository<IPlanDocument> {
  constructor() {
    super(PlanModel);
  }

  async findAllActive(): Promise<IPlanDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ isActive: true, isPublic: true })
      .sort({ sortOrder: 1 })
      .exec();
  }

  async findByPlanId(planId: PlanId): Promise<IPlanDocument | null> {
    await connectToDatabase();
    return this.model.findOne({ planId, isActive: true }).exec();
  }

  async upsertPlan(data: Partial<IPlanDocument>): Promise<IPlanDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { planId: data.planId },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      )
      .exec();
    if (!doc) throw new Error(`Failed to upsert plan: ${data.planId}`);
    return doc;
  }
}

export const planRepository = new PlanRepository();
