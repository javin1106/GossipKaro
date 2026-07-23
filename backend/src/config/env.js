import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true, quiet: true });

const defaultOrigins = "http://localhost:5173,http://127.0.0.1:5173";

const parseOrigins = (value = defaultOrigins) =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
};

const parseTrustProxy = (value) => {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return value;
};

export const isProduction = process.env.NODE_ENV === "production";
export const cookieSameSite = (
  process.env.COOKIE_SAME_SITE || "lax"
).toLowerCase();
export const cookieSecure = parseBoolean(
  process.env.COOKIE_SECURE,
  isProduction || cookieSameSite === "none",
);
export const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

export const validateEnvironment = (env = process.env) => {
  const required = [
    "MONGO_URI",
    "ACCESS_TOKEN_SECRET",
    "REFRESH_TOKEN_SECRET",
  ];

  if (env.NODE_ENV === "production") {
    required.push(
      "CORS_ORIGIN",
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
    );
  }

  if (env.REDIS_REQUIRED === "true") {
    required.push("REDIS_URL");
  }

  const missing = [...new Set(required)].filter(
    (name) => !env[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  const sameSite = (env.COOKIE_SAME_SITE || "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(sameSite)) {
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none");
  }

  const secureCookies = parseBoolean(
    env.COOKIE_SECURE,
    env.NODE_ENV === "production" || sameSite === "none",
  );
  if (sameSite === "none" && !secureCookies) {
    throw new Error("COOKIE_SECURE must be true when COOKIE_SAME_SITE is none");
  }

  if (env.NODE_ENV === "production") {
    const productionOrigins = parseOrigins(env.CORS_ORIGIN);

    if (productionOrigins.includes("*")) {
      throw new Error("CORS_ORIGIN cannot contain * in production");
    }

    if (env.ACCESS_TOKEN_SECRET.length < 32) {
      throw new Error("ACCESS_TOKEN_SECRET must be at least 32 characters");
    }

    if (env.REFRESH_TOKEN_SECRET.length < 32) {
      throw new Error("REFRESH_TOKEN_SECRET must be at least 32 characters");
    }

    if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) {
      throw new Error(
        "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different",
      );
    }
  }
};
