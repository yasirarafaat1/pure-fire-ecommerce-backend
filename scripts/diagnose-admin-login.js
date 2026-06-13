import "../config/env.js";
import { connectDB } from "../config/db.js";
import Admin from "../model/admin.model.js";
import { verifyAdminPassword } from "../utils/adminPassword.js";

const identity = String(process.env.ADMIN_CREATE_EMAIL || process.argv[2] || "")
  .trim()
  .toLowerCase();
const password = String(process.env.ADMIN_CREATE_PASSWORD || "");

if (!identity) {
  console.error("ADMIN_CREATE_EMAIL or identity argument is required");
  process.exit(1);
}

await connectDB();

const admin = await Admin.findOne({
  $or: [{ email: identity }, { username: identity }],
});

if (!admin) {
  console.log("ADMIN_LOGIN_DIAG", JSON.stringify({ identity, exists: false }));
  process.exit(0);
}

console.log(
  "ADMIN_LOGIN_DIAG",
  JSON.stringify({
    identity,
    exists: true,
    email: admin.email || "",
    username: admin.username || "",
    role: admin.role,
    status: admin.status,
    hasSalt: Boolean(admin.salt),
    hashLength: String(admin.passwordHash || "").length,
    passwordMatchesEnv: password
      ? verifyAdminPassword(password, admin.salt, admin.passwordHash)
      : null,
  })
);

process.exit(0);
