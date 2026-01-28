import jwt from "jsonwebtoken";
import User from "./models/user.model.js";
import Group from "./models/group.model.js";
import Message from "./models/message.model.js";

const setupSocket = (io) => {
    
  // middleware
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

    socket.on("join-group", async (groupId) => {
      try {
        if (!groupId) {
          return socket.emit("error", { message: "Group ID is required" });
        }

        const group = await Group.findById(groupId).select("members");
        if (!group) {
          return socket.emit("error", { message: "Group not found" });
        }

        const isMember = group.members.some(
          (memberId) => memberId.toString() === socket.user._id.toString(),
        );

        if (!isMember) {
          return socket.emit("error", { message: "Not a group member" });
        }

        socket.join(groupId);
      } catch (err) {
        socket.emit("error", { message: "Failed to join group" });
      }
    });

    socket.on("send-message", async ({ groupId, content }) => {
      try {
        if (!groupId || !content?.trim()) {
          return socket.emit("error", {
            message: "Group ID and content are required",
          });
        }

        const group = await Group.findById(groupId).select("members");
        if (!group) {
          return socket.emit("error", { message: "Group not found" });
        }

        const isMember = group.members.some(
          (memberId) => memberId.toString() === socket.user._id.toString(),
        );

        if (!isMember) {
          return socket.emit("error", { message: "Not a group member" });
        }

        const message = await Message.create({
          group: groupId,
          sender: socket.user._id,
          content: content.trim(),
          messageType: "text",
        });

        io.to(groupId).emit("new-message", message);
      } catch (err) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });



    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.user.username);
    });
  });
};

export default setupSocket;
