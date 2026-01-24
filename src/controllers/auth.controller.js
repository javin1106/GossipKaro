import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import dotenv from "dotenv";
dotenv.config();

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

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

export const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username?.trim() || !email?.trim() || !password)
    throw new ApiError(400, "All fields are required");

  const exists = await User.findOne({ email });
  if (exists) throw new ApiError(409, "User already exists");

  const user = await User.create({
    username: username.trim(),
    email: email.trim(),
    password,
  });

  const { accessToken, refreshToken } = await generateAccessandRefreshTokens(
    user._id,
  );

  return res
    .status(201)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
      new ApiResponse(
        201,
        {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
          },
          accessToken,
        },
        "User registered successfully",
      ),
    );
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(400, "Email and Password are required");

  const user = await User.findOne({ email });
  if (!user) throw new ApiError(404, "User not found");

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ApiError(401, "Invalid credentials");

  const { accessToken, refreshToken } = await generateAccessandRefreshTokens(
    user._id,
  );

  return res
    .status(201)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .cookie("accessToken", accessToken, cookieOptions)
    .json(
      new ApiResponse(
        201,
        {
          user: {
            id: user._id,
            username: user.username,
            email: user.email,
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
    .clearCookie("refreshToken", cookieOptions)
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

  if (user.refreshToken !== incomingRefreshToken)
    throw new ApiError(401, "Invalid refresh token");

  const { accessToken, refreshToken: newRefreshToken } =
    await generateAccessandRefreshTokens(user._id);

  return res
    .status(200)
    .cookie("refreshToken", newRefreshToken, cookieOptions)
    .json(new ApiResponse(200, { accessToken }, "Access token refreshed"));
});

export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?._id).select(
    "-password -refreshToken",
  );

  if (!user) throw new ApiError(404, "User not found");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "User fetched successfully"));
});
