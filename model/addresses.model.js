import mongoose from "mongoose";

const AddressSchema = new mongoose.Schema(
  {
    address_id: { type: Number },
    full_name: String,
    email: String,
    phone: String,
    alt_phone: String,
    address_line1: String,
    address_line2: String,
    city: String,
    district: String,
    state: String,
    postal_code: String,
    country: { type: String, default: "India" },
    // Frontend-specific fields
    FullName: String,
    phone1: String,
    phone2: String,
    pinCode: String,
    address: String,
    addressType: String,
  },
  { timestamps: true }
);

const Addresses = mongoose.model("Addresses", AddressSchema);
export default Addresses;
