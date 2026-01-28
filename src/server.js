import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";

// Socket.io
import http from "http";
import { Server } from "socket.io";
const server = http.createServer(app);
import setupSocket from "./socket.js";

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

setupSocket(io);

// Load env files
dotenv.config();

// Connect to database
connectDB();

const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
  req.io = io;
  next();
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
