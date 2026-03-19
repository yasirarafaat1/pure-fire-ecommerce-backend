import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
  },
  { timestamps: true }
);

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
