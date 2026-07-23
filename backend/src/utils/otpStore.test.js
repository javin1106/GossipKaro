import assert from "node:assert/strict";
import test from "node:test";
import { createOtpStore } from "./otpStore.js";

test("keeps registration and password-reset OTPs isolated", async () => {
  const email = `purpose-${Date.now()}@example.com`;
  const registrationStore = createOtpStore(null, { purpose: "register" });
  const passwordResetStore = createOtpStore(null, { purpose: "password-reset" });
  const registrationOtp = await registrationStore.createOtp(email);

  assert.deepEqual(
    await passwordResetStore.verifyOtp(email, registrationOtp.otp),
    { ok: false, reason: "expired" },
  );
  assert.deepEqual(
    await registrationStore.verifyOtp(email, registrationOtp.otp),
    { ok: true },
  );
});

test("accepts an OTP once and removes it after verification", async () => {
  const email = `single-use-${Date.now()}@example.com`;
  const store = createOtpStore(null, { purpose: "password-reset" });
  const { otp } = await store.createOtp(email);

  assert.deepEqual(await store.verifyOtp(email, otp), { ok: true });
  assert.deepEqual(await store.verifyOtp(email, otp), {
    ok: false,
    reason: "expired",
  });
});
