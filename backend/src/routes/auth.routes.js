import { Router } from "express";

import {
  registerUser,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  requestPasswordReset,
  resetPassword,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
} from "../controllers/auth.controller.js";

import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  createRateLimitMiddleware,
  emailRateLimitKey,
  ipRateLimitKey,
} from "../middleware/rateLimit.middleware.js";

const authRoutes = Router();

const registerRateLimit = createRateLimitMiddleware({
  scope: "auth:register",
  limit: 5,
  windowSeconds: 15 * 60,
  message: "Too many registration attempts. Please try again later",
  keyGenerator: ipRateLimitKey,
});

const verifyOtpRateLimit = createRateLimitMiddleware({
  scope: "auth:verify-otp",
  limit: 10,
  windowSeconds: 10 * 60,
  message: "Too many OTP attempts. Please try again later",
  keyGenerator: emailRateLimitKey,
});

const resendOtpRateLimit = createRateLimitMiddleware({
  scope: "auth:resend-otp",
  limit: 3,
  windowSeconds: 10 * 60,
  message: "Too many OTP requests. Please wait before requesting another code",
  keyGenerator: emailRateLimitKey,
});

const loginRateLimit = createRateLimitMiddleware({
  scope: "auth:login",
  limit: 10,
  windowSeconds: 15 * 60,
  message: "Too many login attempts. Please try again later",
  keyGenerator: emailRateLimitKey,
});

const forgotPasswordRateLimit = createRateLimitMiddleware({
  scope: "auth:forgot-password",
  limit: 3,
  windowSeconds: 15 * 60,
  message: "Too many reset requests. Please wait before trying again",
  keyGenerator: emailRateLimitKey,
});

const resetPasswordRateLimit = createRateLimitMiddleware({
  scope: "auth:reset-password",
  limit: 10,
  windowSeconds: 10 * 60,
  message: "Too many reset attempts. Please request a new code",
  keyGenerator: emailRateLimitKey,
});

const refreshRateLimit = createRateLimitMiddleware({
  scope: "auth:refresh",
  limit: 30,
  windowSeconds: 15 * 60,
  keyGenerator: ipRateLimitKey,
});

authRoutes.post("/register", registerRateLimit, registerUser);
authRoutes.post("/verify-otp", verifyOtpRateLimit, verifyRegistrationOtp);
authRoutes.post("/resend-otp", resendOtpRateLimit, resendRegistrationOtp);
authRoutes.post(
  "/forgot-password",
  forgotPasswordRateLimit,
  requestPasswordReset,
);
authRoutes.post("/reset-password", resetPasswordRateLimit, resetPassword);
authRoutes.post("/login", loginRateLimit, loginUser);
authRoutes.post("/refresh", refreshRateLimit, refreshAccessToken);
authRoutes.get("/me", verifyJWT, getCurrentUser);
authRoutes.post("/logout", verifyJWT, logoutUser);

export default authRoutes;
