import "./config/env.js";
import { allowedOrigins } from "./config/env.js";
import app from "./app.js";
import connectDB from "./config/db.js";
import connectRedis from "./config/redis.js";

// Socket.io
import http from "http";
import { Server } from "socket.io";
const server = http.createServer(app);
import setupSocket from "./socket.js";

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    credentials: true,
  },
});

const redisState = await connectRedis(io);

setupSocket(io, redisState);
app.set("io", io);

const PORT = process.env.PORT || 5000;

await connectDB();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
