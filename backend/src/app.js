import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./config/env.js";
import { allowedOrigins, trustProxy } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import groupRoutes from "./routes/group.routes.js";
import inviteRoutes from "./routes/invite.routes.js";
import messageRoutes from "./routes/message.routes.js";

const app = express();

if (trustProxy !== false) {
  app.set("trust proxy", trustProxy);
}

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/messages", messageRoutes);

// Health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.use((req, res) => {
  res.status(404).json({
    statusCode: 404,
    data: null,
    message: `Route ${req.originalUrl} not found`,
    success: false,
  });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    statusCode,
    data: err.data ?? null,
    message:
      statusCode >= 500 && process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : err.message || "Something went wrong",
    success: false,
    errors: err.errors || [],
  });
});

export default app;
