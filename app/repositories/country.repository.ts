import { BaseRepository } from "./base.repository";
import CountryModel, { type ICountryDocument } from "~/models/country.model";
import connectToDatabase from "~/config/database";

export class CountryRepository extends BaseRepository<ICountryDocument> {
  constructor() {
    super(CountryModel);
  }

  async findAllActive(): Promise<ICountryDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ isActive: true })
      .sort({ isPopular: -1, name: 1 })
      .exec();
  }

  async findByCode(code: string): Promise<ICountryDocument | null> {
    await connectToDatabase();
    return this.model.findOne({ code: code.toUpperCase() }).exec();
  }

  async findByDialCode(dialCode: string): Promise<ICountryDocument[]> {
    await connectToDatabase();
    return this.model.find({ dialCode, isActive: true }).exec();
  }

  async findPopular(): Promise<ICountryDocument[]> {
    await connectToDatabase();
    return this.model
      .find({ isActive: true, isPopular: true })
      .sort({ name: 1 })
      .exec();
  }

  async upsertCountry(data: Partial<ICountryDocument>): Promise<ICountryDocument> {
    await connectToDatabase();
    const doc = await this.model
      .findOneAndUpdate(
        { code: (data.code ?? "").toUpperCase() },
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      )
      .exec();
    if (!doc) throw new Error(`Failed to upsert country: ${data.code}`);
    return doc;
  }
}

export const countryRepository = new CountryRepository();
