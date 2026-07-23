import assert from "node:assert/strict";
import test from "node:test";
import { validateEnvironment } from "./env.js";

const productionEnvironment = () => ({
  NODE_ENV: "production",
  MONGO_URI: "mongodb://localhost:27017/gossipkaro",
  ACCESS_TOKEN_SECRET: "a".repeat(32),
  REFRESH_TOKEN_SECRET: "b".repeat(32),
  CORS_ORIGIN: "https://chat.example.com",
  COOKIE_SAME_SITE: "none",
  COOKIE_SECURE: "true",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "mailer@example.com",
  SMTP_PASS: "app-password",
  REDIS_REQUIRED: "false",
});

test("accepts a valid production environment", () => {
  assert.doesNotThrow(() => validateEnvironment(productionEnvironment()));
});

test("rejects unsafe production authentication configuration", () => {
  const sameSecrets = productionEnvironment();
  sameSecrets.REFRESH_TOKEN_SECRET = sameSecrets.ACCESS_TOKEN_SECRET;

  assert.throws(
    () => validateEnvironment(sameSecrets),
    /must be different/,
  );

  const wildcardCors = productionEnvironment();
  wildcardCors.CORS_ORIGIN = "*";

  assert.throws(
    () => validateEnvironment(wildcardCors),
    /cannot contain \*/,
  );
});
