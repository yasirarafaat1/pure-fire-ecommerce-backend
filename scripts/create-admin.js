import "../config/env.js";
import { connectDB } from "../config/db.js";
import Admin from "../model/admin.model.js";
import {
  hashAdminPassword,
  validateAdminPassword,
} from "../utils/adminPassword.js";

const email = String(process.env.ADMIN_CREATE_EMAIL || "").trim().toLowerCase();
const password = String(process.env.ADMIN_CREATE_PASSWORD || "");
const name = String(process.env.ADMIN_CREATE_NAME || "Administrator").trim();
const role = String(process.env.ADMIN_CREATE_ROLE || "SUPER_ADMIN").trim().toUpperCase();
const updateExisting =
  process.argv.includes("--update-existing") ||
  String(process.env.ADMIN_CREATE_UPDATE_EXISTING || "").toLowerCase() === "true";
const roles = ["SUPER_ADMIN", "MANAGER", "SUPPORT", "CONTENT"];

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("ADMIN_CREATE_EMAIL is required");
const passwordError = validateAdminPassword(password);
if (passwordError) fail(passwordError);
if (!roles.includes(role)) fail(`ADMIN_CREATE_ROLE must be one of: ${roles.join(", ")}`);

await connectDB();
const existing = await Admin.findOne({ email });
const credentials = hashAdminPassword(password);
if (existing) {
  if (!updateExisting) {
    fail("An admin with this email already exists. Use -- --update-existing to reset it.");
  }
  existing.name = name;
  existing.username = existing.username || email;
  existing.role = role;
  existing.status = "ACTIVE";
  existing.salt = credentials.salt;
  existing.passwordHash = credentials.passwordHash;
  existing.passwordVersion = Number(existing.passwordVersion || 1) + 1;
  await existing.save();
  console.log(`Updated ${existing.role} admin: ${existing.email}`);
  process.exit(0);
}

const admin = await Admin.create({
  name,
  email,
  username: email,
  role,
  status: "ACTIVE",
  ...credentials,
});

console.log(`Created ${admin.role} admin: ${admin.email}`);
process.exit(0);
