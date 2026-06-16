import { loadEnv } from "./env.js";

loadEnv();

const brevoKey = process.env.BREVO_API_KEY || process.env.SIB_API_KEY || "";
const brevoSender = process.env.BREVO_SENDER || "";

const parseSender = (value) => {
  const match = value.match(/^(.*)<(.+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, ""),
      email: match[2].trim(),
    };
  }
  return { name: "", email: value.trim() };
};

const requireBrevoConfig = () => {
  const sender = parseSender(brevoSender);
  if (!brevoKey) throw new Error("BREVO_API_KEY is required for OTP email");
  if (!sender.email) throw new Error("BREVO_SENDER is required for OTP email");
  return sender;
};

const sendBrevoEmail = async ({ to, subject, text, html }) => {
  const sender = requireBrevoConfig();
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
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
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo send failed: ${response.status} ${body}`);
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

  await sendBrevoEmail({ to: email, subject, text, html });
};
