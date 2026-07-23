import assert from "node:assert/strict";
import test from "node:test";
import {
  getPasswordValidationError,
  getUsernameValidationError,
  isValidEmail,
} from "./authValidation.js";

test("accepts a production-safe password length", () => {
  assert.equal(getPasswordValidationError("correct-horse-battery-staple"), "");
});

test("rejects short passwords and bcrypt-truncated input", () => {
  assert.match(getPasswordValidationError("short"), /at least 8/);
  assert.match(getPasswordValidationError("a".repeat(73)), /at most 72 bytes/);
});

test("validates onboarding email and username boundaries", () => {
  assert.equal(isValidEmail("person@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(getUsernameValidationError("ja"), "");
  assert.match(getUsernameValidationError("j"), /at least 2/);
  assert.match(getUsernameValidationError("j".repeat(31)), /at most 30/);
});
