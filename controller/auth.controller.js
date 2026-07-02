import crypto from "crypto";
import { loadEnv } from "../config/env.js";
import Profile from "../model/profile.model.js";
import OtpToken from "../model/otp.model.js";
import UserSession from "../model/session.model.js";
import { sendOtpEmail } from "../config/mailer.js";
import { v4 as uuidv4 } from "uuid";

loadEnv();

const OTP_SECRET = process.env.OTP_SECRET || "purefire-otp-secret";
const OTP_TTL_MIN = Number(process.env.OTP_TTL_MIN || 10);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 15);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isBlockedProfile = (profile) => String(profile?.status || "").toUpperCase() === "BLOCKED";

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

    const profile = await Profile.findOne({ email }).select("status").lean();
    if (isBlockedProfile(profile)) {
      return res.status(403).json({
        status: false,
        message: "Your account is blocked. Please contact support.",
      });
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
    if (isBlockedProfile(profile)) {
      return res.status(403).json({
        status: false,
        message: "Your account is blocked. Please contact support.",
      });
    }

    if (!profile) {
      profile = await Profile.create({ email, name: "", lastLoginAt: new Date() });
    } else {
      profile.lastLoginAt = new Date();
      await profile.save();
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
