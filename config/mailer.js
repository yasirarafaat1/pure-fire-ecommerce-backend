import nodemailer from "nodemailer";
import { loadEnv } from "./env.js";

loadEnv();

const host = process.env.SMTP_HOST || "";
const port = Number(process.env.SMTP_PORT || 0);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
const from = process.env.SMTP_FROM || user || "";

const isReady = Boolean(host && port && user && pass && from);

const transporter = isReady
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })
  : null;

export const sendOtpEmail = async (email, otp) => {
  if (!transporter) {
    throw new Error("SMTP not configured");
  }
  const subject = "Your Pure Fire OTP";
  const text = `Your OTP is ${otp}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;">
      <h3>Your Pure Fire OTP</h3>
      <p>Use this OTP to login: <strong>${otp}</strong></p>
      <p>This OTP expires in 10 minutes.</p>
    </div>
  `;
  await transporter.sendMail({ from, to: email, subject, text, html });
};
