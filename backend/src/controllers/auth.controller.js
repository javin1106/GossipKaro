import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  sendPasswordResetOtpEmail,
  sendRegistrationOtpEmail,
} from "../utils/email.js";
import {
  getPasswordValidationError,
  getUsernameValidationError,
  isValidEmail,
} from "../utils/authValidation.js";
import { getUserSocketRoom } from "../utils/socketRooms.js";
import {
  cookieSameSite,
  cookieSecure,
} from "../config/env.js";

const cookieBaseOptions = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  path: "/",
};

const accessCookieOptions = {
  ...cookieBaseOptions,
  maxAge: 24 * 60 * 60 * 1000,
};

const refreshCookieOptions = {
  ...cookieBaseOptions,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const DUMMY_PASSWORD_HASH =
  "$2b$10$7rgYMhUmvERJmC.jOqdU3ui93OUKpKR64nSDk.4WVu.tKrBBZX3Ye";

const generateAccessandRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) throw new ApiError(404, "User not found");

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateModifiedOnly: true });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error(error);
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const getSafeUser = (user) => ({
  id: user._id,
  username: user.username,
  email: user.email,
  isVerified: user.isVerified,
});

const getOtpStore = (req) => {
  const otpStore = req.app.get("otpStore");
  if (!otpStore) throw new ApiError(500, "OTP service is unavailable");
  return otpStore;
};

const getPasswordResetOtpStore = (req) => {
  const otpStore = req.app.get("passwordResetOtpStore");
  if (!otpStore) throw new ApiError(500, "Password reset service is unavailable");
  return otpStore;
};

const buildOtpResponse = (otpResult) => ({
  expiresInSeconds: otpResult.expiresInSeconds,
});

export const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username?.trim() || !email?.trim() || !password)
    throw new ApiError(400, "All fields are required");

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();
  if (!isValidEmail(normalizedEmail)) {
    throw new ApiError(400, "Enter a valid email address");
  }

  const usernameError = getUsernameValidationError(normalizedUsername);
  if (usernameError) throw new ApiError(400, usernameError);

  const passwordError = getPasswordValidationError(password);
  if (passwordError) throw new ApiError(400, passwordError);

  const existingEmailUser = await User.findOne({ email: normalizedEmail });
  const existingUsernameUser = await User.findOne({ username: normalizedUsername });

  if (existingEmailUser && existingEmailUser.isVerified !== false) {
    throw new ApiError(409, "User already exists");
  }

  if (
    existingUsernameUser &&
    existingUsernameUser._id.toString() !== existingEmailUser?._id.toString()
  ) {
    throw new ApiError(409, "Username already exists");
  }

  const user =
    existingEmailUser ||
    new User({
      email: normalizedEmail,
    });

  user.username = normalizedUsername;
  user.password = password;
  user.isVerified = false;
  user.refreshToken = null;
  await user.save();

  const otpStore = getOtpStore(req);
  const otpResult = await otpStore.createOtp(normalizedEmail);
  try {
    await sendRegistrationOtpEmail({
      to: normalizedEmail,
      otp: otpResult.otp,
      username: user.username,
    });
  } catch (error) {
    await otpStore.deleteOtp(normalizedEmail);
    throw error;
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        {
          email: normalizedEmail,
          ...buildOtpResponse(otpResult),
        },
        "OTP sent for account verification",
      ),
    );
});

export const verifyRegistrationOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email?.trim() || !/^\d{6}$/.test(otp?.trim() || "")) {
    throw new ApiError(400, "Email and OTP are required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const otpStore = getOtpStore(req);
  const verification = await otpStore.verifyOtp(normalizedEmail, otp.trim());

  if (!verification.ok) {
    const message =
      verification.reason === "locked"
        ? "Too many invalid OTP attempts. Please request a new OTP"
        : verification.reason === "expired"
          ? "OTP expired. Please request a new OTP"
          : "Invalid OTP";
    throw new ApiError(400, message);
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new ApiError(404, "User not found");

  user.isVerified = true;
  await user.save({ validateModifiedOnly: true });

  const { accessToken, refreshToken } = await generateAccessandRefreshTokens(user._id);

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, refreshCookieOptions)
    .cookie("accessToken", accessToken, accessCookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: getSafeUser(user),
          accessToken,
        },
        "Account verified successfully",
      ),
    );
});

export const resendRegistrationOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email?.trim()) {
    throw new ApiError(400, "Email is required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) throw new ApiError(404, "User not found");
  if (user.isVerified !== false) throw new ApiError(400, "Account is already verified");

  const otpStore = getOtpStore(req);
  const otpResult = await otpStore.createOtp(normalizedEmail);
  try {
    await sendRegistrationOtpEmail({
      to: normalizedEmail,
      otp: otpResult.otp,
      username: user.username,
    });
  } catch (error) {
    await otpStore.deleteOtp(normalizedEmail);
    throw error;
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        email: normalizedEmail,
        ...buildOtpResponse(otpResult),
      },
      "OTP resent",
    ),
  );
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const normalizedEmail = req.body?.email?.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    throw new ApiError(400, "Enter a valid email address");
  }

  const user = await User.findOne({
    email: normalizedEmail,
    isVerified: { $ne: false },
  });

  if (user) {
    const otpStore = getPasswordResetOtpStore(req);
    const otpResult = await otpStore.createOtp(normalizedEmail);

    try {
      await sendPasswordResetOtpEmail({
        to: normalizedEmail,
        otp: otpResult.otp,
        username: user.username,
      });
    } catch (error) {
      await otpStore.deleteOtp(normalizedEmail);
      throw error;
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      { email: normalizedEmail },
      "If an account exists for this email, a reset code has been sent",
    ),
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const normalizedEmail = req.body?.email?.trim().toLowerCase();
  const otp = req.body?.otp?.trim();
  const password = req.body?.password;

  if (!isValidEmail(normalizedEmail) || !/^\d{6}$/.test(otp || "")) {
    throw new ApiError(400, "Email and reset code are required");
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) throw new ApiError(400, passwordError);

  const otpStore = getPasswordResetOtpStore(req);
  const verification = await otpStore.verifyOtp(normalizedEmail, otp);

  if (!verification.ok) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  const user = await User.findOne({
    email: normalizedEmail,
    isVerified: { $ne: false },
  });

  if (!user) {
    throw new ApiError(400, "Invalid or expired reset code");
  }

  user.password = password;
  user.refreshToken = null;
  user.authVersion = (user.authVersion || 0) + 1;
  await user.save();

  const io = req.app.get("io");
  const userRoom = getUserSocketRoom(user._id);
  io?.to(userRoom).emit("session-revoked", { reason: "password-reset" });
  io?.in(userRoom).disconnectSockets(true);

  return res
    .status(200)
    .clearCookie("refreshToken", cookieBaseOptions)
    .clearCookie("accessToken", cookieBaseOptions)
    .json(new ApiResponse(200, {}, "Password reset successfully"));
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(400, "Email and Password are required");

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  const isMatch = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");
  if (user.isVerified === false) throw new ApiError(403, "Please verify your account first");

  const { accessToken, refreshToken } = await generateAccessandRefreshTokens(
    user._id,
  );

  return res
    .status(201)
    .cookie("refreshToken", refreshToken, refreshCookieOptions)
    .cookie("accessToken", accessToken, accessCookieOptions)
    .json(
      new ApiResponse(
        201,
        {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
            isVerified: user.isVerified,
          },
          accessToken,
        },
        "Login successful",
      ),
    );
});

export const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (userId) {
    await User.findByIdAndUpdate(
      userId,
      { $set: { refreshToken: null } },
      { new: true },
    );
  }

  return res
    .status(200)
    .clearCookie("refreshToken", cookieBaseOptions)
    .clearCookie("accessToken", cookieBaseOptions)
    .json(new ApiResponse(200, {}, "Logged out successfully"));
});

export const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken;

  if (!incomingRefreshToken) throw new ApiError(401, "Unauthorized request");

  const decoded = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET,
  );

  const user = await User.findById(decoded?.id);
  if (!user) throw new ApiError(404, "User not found");

  if ((decoded.authVersion ?? 0) !== (user.authVersion || 0)) {
    throw new ApiError(401, "Invalid refresh token");
  }

  if (user.refreshToken !== incomingRefreshToken)
    throw new ApiError(401, "Invalid refresh token");

  const { accessToken, refreshToken: newRefreshToken } =
    await generateAccessandRefreshTokens(user._id);

  return res
    .status(200)
    .cookie("refreshToken", newRefreshToken, refreshCookieOptions)
    .cookie("accessToken", accessToken, accessCookieOptions)
    .json(new ApiResponse(200, { accessToken }, "Access token refreshed"));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?._id).select(
    "-password -refreshToken -authVersion",
  );

  if (!user) throw new ApiError(404, "User not found");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});
