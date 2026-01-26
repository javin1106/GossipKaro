import jwt from "jsonwebtoken";
import User from "./models/user.model.js";

const setupSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.id).select("_id username");

      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.user.username);

    socket.on("join-group", (groupId) => {
      socket.join(groupId);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user.username);
    });
  });
};

export default setupSocket;
