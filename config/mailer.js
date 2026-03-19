import nodemailer from "nodemailer";
import { loadEnv } from "./env.js";

loadEnv();

const host = process.env.SMTP_HOST || "";
const port = Number(process.env.SMTP_PORT || 0);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
const from = process.env.SMTP_FROM || user || "";
const brevoKey = process.env.BREVO_API_KEY || process.env.SIB_API_KEY || "";
const brevoSender = process.env.BREVO_SENDER || from;

const isReady = Boolean(host && port && user && pass && from);
const useBrevo = Boolean(brevoKey && brevoSender);

const transporter = !useBrevo && isReady
  ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      requireTLS: port === 587,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    })
  : null;

if (transporter) {
  transporter
    .verify()
    .then(() => console.log("SMTP ready"))
    .catch((err) => console.error("SMTP verify failed:", err?.message || err));
}

const parseSender = (value) => {
  const match = value.match(/^(.*)<(.+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^\"|\"$/g, ""),
      email: match[2].trim(),
    };
  }
  return { name: "", email: value.trim() };
};

const sendBrevoEmail = async ({ to, subject, text, html }) => {
  const sender = parseSender(brevoSender);
  if (!sender.email) {
    throw new Error("Brevo sender email missing");
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo send failed: ${res.status} ${body}`);
  }
};

export const sendOtpEmail = async (email, otp) => {
  const subject = "Your Pure Fire OTP";
  const text = `Your OTP is ${otp}. It expires in 10 minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;">
      <h3>Your Pure Fire OTP</h3>
      <p>Use this OTP to login: <strong>${otp}</strong></p>
      <p>This OTP expires in 10 minutes.</p>
    </div>
  `;

  if (useBrevo) {
    await sendBrevoEmail({ to: email, subject, text, html });
    return;
  }
  if (!transporter) {
    throw new Error("SMTP not configured");
  }
  await transporter.sendMail({ from, to: email, subject, text, html });
};
