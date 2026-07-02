import { Router } from "express";
import { createInvite, joinInvite } from "../controllers/invite.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const inviteRoutes = Router();

inviteRoutes.post("/create", verifyJWT, createInvite);
inviteRoutes.post("/join/:code", verifyJWT, joinInvite);

export default inviteRoutes;
