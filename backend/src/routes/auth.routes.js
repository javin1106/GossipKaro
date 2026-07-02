import { Router } from "express";

import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getCurrentUser,
} from "../controllers/auth.controller.js";

import { verifyJWT } from "../middleware/auth.middleware.js";

const authRoutes = Router();

authRoutes.post("/register", registerUser);
authRoutes.post("/login", loginUser);
authRoutes.post("/refresh", refreshAccessToken);
authRoutes.get("/me", verifyJWT, getCurrentUser);
authRoutes.post("/logout", verifyJWT, logoutUser);

export default authRoutes;
