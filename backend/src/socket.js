import jwt from "jsonwebtoken";
import User from "./models/user.model.js";
import Group from "./models/group.model.js";
import Message from "./models/message.model.js";

const USER_SOCKET_KEY_PREFIX = "gossipkaro:presence:user:";
const PRESENCE_TTL_SECONDS = 24 * 60 * 60;

const setupSocket = (io, { presenceClient } = {}) => {
  const onlineUsers = new Map();

  const userSocketsKey = (userId) => `${USER_SOCKET_KEY_PREFIX}${userId}`;

  const addOnlineUser = async (userId, socketId) => {
    if (presenceClient) {
      const key = userSocketsKey(userId);
      await presenceClient.sAdd(key, socketId);
      await presenceClient.expire(key, PRESENCE_TTL_SECONDS);
      const socketCount = await presenceClient.sCard(key);
      return socketCount === 1;
    }

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socketId);
    return onlineUsers.get(userId).size === 1;
  };

  const removeOnlineUser = async (userId, socketId) => {
    if (presenceClient) {
      const key = userSocketsKey(userId);
      await presenceClient.sRem(key, socketId);
      const socketCount = await presenceClient.sCard(key);

      if (socketCount === 0) {
        await presenceClient.del(key);
        return true;
      }

      return false;
    }

    const sockets = onlineUsers.get(userId);
    if (!sockets) return false;

    sockets.delete(socketId);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
      return true;
    }

    return false;
  };

  const getOnlineUserIds = async (members) => {
    const memberIds = members.map((memberId) => memberId.toString());

    if (presenceClient) {
      const checks = memberIds.map(async (memberId) => {
        const socketCount = await presenceClient.sCard(userSocketsKey(memberId));
        return socketCount > 0 ? memberId : null;
      });

      return (await Promise.all(checks)).filter(Boolean);
    }

    return memberIds.filter((memberId) => onlineUsers.has(memberId));
  };

  const markGroupAsRead = async (groupId, userId) => {
    const group = await Group.findById(groupId).select("members readReceipts");
    if (!group) return null;

    const isMember = group.members.some(
      (memberId) => memberId.toString() === userId.toString(),
    );
    if (!isMember) return null;

    const receipt = group.readReceipts.find(
      (item) => item.user.toString() === userId.toString(),
    );

    if (receipt) {
      receipt.lastReadAt = new Date();
    } else {
      group.readReceipts.push({ user: userId, lastReadAt: new Date() });
    }

    await group.save();
    return group;
  };

  // middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.id).select("_id username email");

      if (!user) return next(new Error("User not found"));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.user.username);
    const userId = socket.user._id.toString();
    socket.joinedGroups = new Set();

    const joinUserGroups = async () => {
      const becameOnline = await addOnlineUser(userId, socket.id);
      const groups = await Group.find({ members: socket.user._id }).select("members");

      for (const group of groups) {
        const groupId = group._id.toString();
        socket.join(groupId);
        socket.joinedGroups.add(groupId);

        if (becameOnline) {
          io.to(groupId).emit("presence-updated", {
            groupId,
            userId,
            isOnline: true,
          });
        }

        socket.emit("online-users", {
          groupId,
          userIds: await getOnlineUserIds(group.members),
        });
      }
    };

    joinUserGroups().catch(() => {
      socket.emit("error", { message: "Failed to join your groups" });
    });

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
        socket.joinedGroups.add(groupId);
        socket.emit("online-users", {
          groupId,
          userIds: await getOnlineUserIds(group.members),
        });
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

        // Populate sender info before broadcasting
        await message.populate("sender", "username email");
        await message.populate("reactions.user", "username email");

        io.to(groupId).emit("new-message", message);
      } catch (err) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("mark-read", async ({ groupId }) => {
      try {
        if (!groupId) return;

        const group = await markGroupAsRead(groupId, socket.user._id);
        if (!group) return;

        socket.emit("unread-count-updated", { groupId, unreadCount: 0 });
      } catch {
        socket.emit("error", { message: "Failed to mark group as read" });
      }
    });

    socket.on("react-message", async ({ groupId, messageId, emoji }) => {
      try {
        if (!groupId || !messageId || !emoji?.trim()) {
          return socket.emit("error", { message: "Reaction details are required" });
        }

        const reactionEmoji = emoji.trim();
        if (reactionEmoji.length > 16) {
          return socket.emit("error", { message: "Reaction is too long" });
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

        const message = await Message.findOne({ _id: messageId, group: groupId });
        if (!message) {
          return socket.emit("error", { message: "Message not found" });
        }

        const existingIndex = message.reactions.findIndex(
          (reaction) =>
            reaction.user.toString() === socket.user._id.toString() &&
            reaction.emoji === reactionEmoji,
        );

        if (existingIndex >= 0) {
          message.reactions.splice(existingIndex, 1);
        } else {
          message.reactions.push({
            emoji: reactionEmoji,
            user: socket.user._id,
          });
        }

        await message.save();
        await message.populate("reactions.user", "username email");

        io.to(groupId).emit("message-reaction-updated", {
          groupId,
          messageId,
          reactions: message.reactions,
        });
      } catch (err) {
        socket.emit("error", { message: "Failed to update reaction" });
      }
    });

    socket.on("typing", ({ groupId }) => {
      socket.to(groupId).emit("user-typing", {
        username: socket.user.username || socket.user.email,
        userId: socket.user._id,
      });
    });

    socket.on("stop-typing", ({ groupId }) => {
      socket.to(groupId).emit("user-stopped-typing", {
        userId: socket.user._id,
      });
    });

    socket.on("disconnect", async () => {
      try {
        const wentOffline = await removeOnlineUser(userId, socket.id);
        if (wentOffline) {
          for (const groupId of socket.joinedGroups) {
            io.to(groupId).emit("presence-updated", {
              groupId,
              userId,
              isOnline: false,
            });
          }
        }
      } catch {
        for (const groupId of socket.joinedGroups) {
          io.to(groupId).emit("presence-updated", {
            groupId,
            userId,
            isOnline: false,
          });
        }
      }
      console.log("User disconnected:", socket.user.username || socket.user.email);
    });
  });
};

export default setupSocket;
