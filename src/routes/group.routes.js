import { Router } from "express";
import {
  createGroup,
  getUserGroups,
  getGroupDetails,
  getMessages,
  leaveGroup,
} from "../controllers/group.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const groupRoutes = Router();

groupRoutes.post("/create", verifyJWT, createGroup);
groupRoutes.get("/", verifyJWT, getUserGroups);
groupRoutes.get("/:groupId", verifyJWT, getGroupDetails);
groupRoutes.get("/:groupId/messages", verifyJWT, getMessages);
groupRoutes.post("/:groupId/leave", verifyJWT, leaveGroup);

export default groupRoutes;
