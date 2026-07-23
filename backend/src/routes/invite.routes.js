import { Router } from "express";
import { createInvite, joinInvite } from "../controllers/invite.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  createRateLimitMiddleware,
  userRateLimitKey,
} from "../middleware/rateLimit.middleware.js";

const inviteRoutes = Router();

const createInviteRateLimit = createRateLimitMiddleware({
  scope: "invite:create",
  limit: 10,
  windowSeconds: 10 * 60,
  message: "Too many invites created. Please try again later",
  keyGenerator: userRateLimitKey,
});

inviteRoutes.post("/create", verifyJWT, createInviteRateLimit, createInvite);
inviteRoutes.post("/join/:code", verifyJWT, joinInvite);

export default inviteRoutes;
