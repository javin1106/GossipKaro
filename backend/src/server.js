import "./config/env.js";
import {
  allowedOrigins,
  validateEnvironment,
} from "./config/env.js";
import app from "./app.js";
import connectDB from "./config/db.js";
import connectRedis from "./config/redis.js";
import { createOtpStore } from "./utils/otpStore.js";
import { createRateLimiter } from "./utils/rateLimiter.js";

// Socket.io
import http from "http";
import { Server } from "socket.io";
const server = http.createServer(app);
import setupSocket from "./socket.js";

validateEnvironment();

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    credentials: true,
  },
  maxHttpBufferSize: 8 * 1024 * 1024,
});

const redisState = await connectRedis(io);
const rateLimiter = createRateLimiter(redisState.rateLimitClient);

setupSocket(io, { ...redisState, rateLimiter });
app.set("io", io);
app.set("otpStore", createOtpStore(redisState.otpClient));
app.set(
  "passwordResetOtpStore",
  createOtpStore(redisState.otpClient, { purpose: "password-reset" }),
);
app.set("rateLimiter", rateLimiter);

const PORT = process.env.PORT || 5000;

await connectDB();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
