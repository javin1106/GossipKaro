import { Router } from "express";
import { createGroup } from "../controllers/group.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const groupRoutes = Router();

groupRoutes.post("/create", verifyJWT, createGroup);

export default groupRoutes;
