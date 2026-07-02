import type {
  Document,
  Model,
  FilterQuery,
  UpdateQuery,
  ProjectionType,
} from "mongoose";
import type { PaginationQuery, PaginationMeta } from "~/types/common.types";

export interface IBaseRepository<T extends Document> {
  findById(id: string, projection?: ProjectionType<T>): Promise<T | null>;
  findOne(
    filter: FilterQuery<T>,
    projection?: ProjectionType<T>
  ): Promise<T | null>;
  findMany(
    filter: FilterQuery<T>,
    options?: PaginationQuery,
    projection?: ProjectionType<T>
  ): Promise<{ data: T[]; meta: PaginationMeta }>;
  create(data: Partial<T>): Promise<T>;
  updateById(id: string, update: UpdateQuery<T>): Promise<T | null>;
  updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>
  ): Promise<T | null>;
  deleteById(id: string): Promise<boolean>;
  deleteMany(filter: FilterQuery<T>): Promise<number>;
  count(filter?: FilterQuery<T>): Promise<number>;
  exists(filter: FilterQuery<T>): Promise<boolean>;
}

export abstract class BaseRepository<T extends Document>
  implements IBaseRepository<T>
{
  constructor(protected readonly model: Model<T>) {}

  async findById(
    id: string,
    projection?: ProjectionType<T>
  ): Promise<T | null> {
    return this.model.findById(id, projection).exec();
  }

  async findOne(
    filter: FilterQuery<T>,
    projection?: ProjectionType<T>
  ): Promise<T | null> {
    return this.model.findOne(filter, projection).exec();
  }

  async findMany(
    filter: FilterQuery<T>,
    options: PaginationQuery = {},
    projection?: ProjectionType<T>
  ): Promise<{ data: T[]; meta: PaginationMeta }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const skip = (page - 1) * limit;
    const sortField = options.sortBy ?? "createdAt";
    const sortOrder = options.sortOrder === "asc" ? 1 : -1;

    const [data, total] = await Promise.all([
      this.model
        .find(filter, projection)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async create(data: Partial<T>): Promise<T> {
    return this.model.create(data);
  }

  async updateById(id: string, update: UpdateQuery<T>): Promise<T | null> {
    return this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .exec();
  }

  async updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>
  ): Promise<T | null> {
    return this.model
      .findOneAndUpdate(filter, update, { new: true, runValidators: true })
      .exec();
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.model.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async deleteMany(filter: FilterQuery<T>): Promise<number> {
    const result = await this.model.deleteMany(filter).exec();
    return result.deletedCount;
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async exists(filter: FilterQuery<T>): Promise<boolean> {
    const result = await this.model.exists(filter).exec();
    return result !== null;
  }
}
