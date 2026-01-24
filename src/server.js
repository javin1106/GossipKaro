import express from "express";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import groupRoutes from "./routes/group.routes.js";

// env files
dotenv.config();

// create app
const app = express();
connectDB();

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/groups", groupRoutes);

// health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
