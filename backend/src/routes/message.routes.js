import { Router } from "express";
import { sendMessage } from "../controllers/message.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const messageRoutes = Router();

messageRoutes.post("/send", verifyJWT, sendMessage);

export default messageRoutes;
