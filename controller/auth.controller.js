import crypto from "crypto";
import Admin from "../model/admin.model.js";
import { loadEnv } from "../config/env.js";
import Profile from "../model/profile.model.js";
import OtpToken from "../model/otp.model.js";
import UserSession from "../model/session.model.js";
import { sendOtpEmail } from "../config/mailer.js";
import { v4 as uuidv4 } from "uuid";

loadEnv();

const ADMIN_SECRET = process.env.ADMIN_SECRET || "purefire-admin-secret";
const OTP_SECRET = process.env.OTP_SECRET || "purefire-otp-secret";
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 15);
const DEFAULT_ADMIN = {
  username: process.env.ADMIN_USER || "admin",
  password: process.env.ADMIN_PASS || "admin123",
};

const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
};

const ensureDefaultAdmin = async () => {
  const existing = await Admin.findOne({ username: DEFAULT_ADMIN.username });
  if (!existing) {
    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = hashPassword(DEFAULT_ADMIN.password, salt);
    await Admin.create({ username: DEFAULT_ADMIN.username, passwordHash, salt });
    console.log("Seeded default admin user");
  }
};

const signToken = (username) => {
  const payload = `${username}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex");
  return `${Buffer.from(payload).toString("base64")}.${sig}`;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hashOtp = (email, otp) => {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");
};

export const sendUserOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ status: false, message: "Valid email required" });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000);
    const otpHash = hashOtp(email, otp);

    await OtpToken.findOneAndUpdate(
      { email },
      { email, otpHash, expiresAt, attempts: 0 },
      { upsert: true, returnDocument: "after" }
    );

    await sendOtpEmail(email, otp);
    return res.status(200).json({
      status: true,
      message: "OTP sent",
      expiresIn: OTP_TTL_MIN * 60,
    });
  } catch (error) {
    console.error("sendUserOtp error:", error);
    return res.status(500).json({ status: false, message: error.message || "Failed to send OTP" });
  }
};

export const verifyUserOtp = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim().toLowerCase();
    const otp = (req.body?.otp || "").trim();
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ status: false, message: "Valid email required" });
    }
    if (!otp || otp.length !== 4) {
      return res.status(400).json({ status: false, message: "4-digit OTP required" });
    }

    const record = await OtpToken.findOne({ email });
    if (!record) {
      return res.status(400).json({ status: false, message: "OTP expired. Request a new one." });
    }
    if (record.expiresAt.getTime() < Date.now()) {
      await OtpToken.deleteOne({ email });
      return res.status(400).json({ status: false, message: "OTP expired. Request a new one." });
    }
    if (record.attempts >= 5) {
      await OtpToken.deleteOne({ email });
      return res.status(400).json({ status: false, message: "Too many attempts. Request a new OTP." });
    }

    const providedHash = hashOtp(email, otp);
    if (providedHash !== record.otpHash) {
      await OtpToken.updateOne({ email }, { $inc: { attempts: 1 } });
      return res.status(400).json({ status: false, message: "Invalid OTP" });
    }

    await OtpToken.deleteOne({ email });

    let profile = await Profile.findOne({ email });
    const isNew = !profile;
    if (!profile) {
      profile = await Profile.create({ email, name: "" });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    await UserSession.create({ email, token, expiresAt });

    return res.status(200).json({
      status: true,
      token,
      email,
      profile,
      isNew,
    });
  } catch (error) {
    console.error("verifyUserOtp error:", error);
    return res.status(500).json({ status: false, message: "OTP verification failed" });
  }
};

export const adminLogin = async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ status: false, message: "Username and password required" });
  }
  try {
    await ensureDefaultAdmin();
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ status: false, message: "Invalid credentials" });
    const hash = hashPassword(password, admin.salt);
    if (hash !== admin.passwordHash) {
      return res.status(401).json({ status: false, message: "Invalid credentials" });
    }
    const token = signToken(username);
    return res.status(200).json({ status: true, token, username });
  } catch (error) {
    console.error("adminLogin error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const adminResetPassword = async (req, res) => {
  const { username, currentPassword, newPassword } = req.body || {};
  if (!username || !currentPassword || !newPassword) {
    return res.status(400).json({ status: false, message: "username, currentPassword, newPassword required" });
  }
  try {
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(404).json({ status: false, message: "Admin not found" });
    const currentHash = hashPassword(currentPassword, admin.salt);
    if (currentHash !== admin.passwordHash) {
      return res.status(401).json({ status: false, message: "Current password incorrect" });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    admin.salt = salt;
    admin.passwordHash = hashPassword(newPassword, salt);
    await admin.save();
    return res.status(200).json({ status: true, message: "Password updated" });
  } catch (error) {
    console.error("adminResetPassword error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};
