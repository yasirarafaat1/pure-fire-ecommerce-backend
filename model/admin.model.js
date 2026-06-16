import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    username: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: { type: String, required: true },
    salt: { type: String, required: true },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "MANAGER", "SUPPORT", "CONTENT"],
      default: "SUPER_ADMIN",
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "DISABLED"],
      default: "ACTIVE",
      index: true,
    },
    passwordVersion: { type: Number, default: 1 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminSchema.pre("validate", function ensureIdentity() {
  if (!this.email && !this.username) {
    this.invalidate("email", "Email or username is required");
  }
});

const Admin = mongoose.model("Admin", adminSchema);
export default Admin;
