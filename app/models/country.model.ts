import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ICountryDocument extends Document {
  _id: mongoose.Types.ObjectId;
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  isActive: boolean;
  isPopular: boolean;
  region: string;
  supportedByDefaultGateway: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CountrySchema = new Schema<ICountryDocument>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      length: 2,
    },
    name: { type: String, required: true },
    dialCode: { type: String, required: true },
    flag: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    isPopular: { type: Boolean, default: false, index: true },
    region: { type: String, required: true },
    supportedByDefaultGateway: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "countries",
  }
);

CountrySchema.index({ isActive: 1, isPopular: -1, name: 1 });
CountrySchema.index({ dialCode: 1 });

export const CountryModel: Model<ICountryDocument> =
  (mongoose.models.Country as Model<ICountryDocument>) ??
  mongoose.model<ICountryDocument>("Country", CountrySchema);

export default CountryModel;
