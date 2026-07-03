import nodemailer from "nodemailer";
import { ApiError } from "./ApiError.js";

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const rawPass = process.env.SMTP_PASS?.trim();
  const pass = host?.includes("gmail.com") ? rawPass?.replace(/\s+/g, "") : rawPass;
  const missing = [
    ["SMTP_HOST", host],
    ["SMTP_USER", user],
    ["SMTP_PASS", pass],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new ApiError(
      500,
      `Email service is not configured. Missing: ${missing.join(", ")}`,
    );
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
};

export const sendRegistrationOtpEmail = async ({ to, otp, username }) => {
  const appName = "GossipKaro";
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();

  await getTransporter().sendMail({
    from,
    to,
    subject: `${appName} verification code`,
    text: `Your ${appName} verification code is ${otp}. It expires in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111b21">
        <h2>${appName}</h2>
        <p>Hi ${username || "there"},</p>
        <p>Your verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
        <p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
};
