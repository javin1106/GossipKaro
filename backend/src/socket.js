import jwt from "jsonwebtoken";
import User from "./models/user.model.js";
import Group from "./models/group.model.js";
import Message from "./models/message.model.js";
import {
  getAuthorizedGroupSocketRoom,
  getUserSocketRoom,
} from "./utils/socketRooms.js";

const USER_SOCKET_KEY_PREFIX = "gossipkaro:presence:user:";
const GROUP_PRESENCE_REVISION_KEY_PREFIX = "gossipkaro:presence:revision:";
const PRESENCE_TTL_SECONDS = 24 * 60 * 60;
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_LENGTH = 12000;
const SOCKET_EVENT_LIMITS = {
  joinGroup: { limit: 30, windowSeconds: 60 },
  sendMessage: { limit: 30, windowSeconds: 10 },
  messageMutation: { limit: 60, windowSeconds: 60 },
  markRead: { limit: 120, windowSeconds: 60 },
  typing: { limit: 20, windowSeconds: 10 },
};

const setupSocket = (io, { presenceClient, rateLimiter } = {}) => {
  const onlineUsers = new Map();
  const groupPresenceRevisions = new Map();

  const userSocketsKey = (userId) => `${USER_SOCKET_KEY_PREFIX}${userId}`;
  const groupPresenceRevisionKey = (groupId) =>
    `${GROUP_PRESENCE_REVISION_KEY_PREFIX}${groupId}`;

  const getPresenceRevision = async (groupId) => {
    if (presenceClient) {
      const revision = await presenceClient.get(
        groupPresenceRevisionKey(groupId),
      );
      return Number(revision) || 0;
    }

    return groupPresenceRevisions.get(groupId) || 0;
  };

  const bumpPresenceRevision = async (groupId) => {
    if (presenceClient) {
      return Number(
        await presenceClient.incr(groupPresenceRevisionKey(groupId)),
      );
    }

    const revision = (groupPresenceRevisions.get(groupId) || 0) + 1;
    groupPresenceRevisions.set(groupId, revision);
    return revision;
  };

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

  const getPresenceSnapshot = async (groupId, members) => {
    // Read the revision first. If presence changes while the snapshot is being
    // assembled, the later delta has a higher revision and wins on the client.
    const revision = await getPresenceRevision(groupId);
    const userIds = await getOnlineUserIds(members);
    return { groupId, userIds, revision };
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

  const populateMessage = async (message) => {
    await message.populate("sender", "username email");
    await message.populate("reactions.user", "username email");
    await message.populate({
      path: "replyTo",
      select:
        "content sender messageType attachment isDeleted createdAt",
      populate: {
        path: "sender",
        select: "username email",
      },
    });

    return message;
  };

  const findMemberGroup = async (groupId, userId) => {
    const group = await Group.findById(groupId).select("members admins");
    if (!group) return null;

    const isMember = group.members.some(
      (memberId) => memberId.toString() === userId.toString(),
    );

    return isMember ? group : null;
  };

  const validateAttachment = (attachment) => {
    if (!attachment) return null;

    const { fileName, mimeType, size, dataUrl } = attachment;
    const normalizedSize = Number(size);

    if (
      typeof fileName !== "string" ||
      typeof mimeType !== "string" ||
      typeof dataUrl !== "string" ||
      !Number.isFinite(normalizedSize)
    ) {
      return { error: "Attachment details are incomplete" };
    }

    if (normalizedSize > MAX_ATTACHMENT_BYTES) {
      return { error: "Attachment must be 2MB or smaller" };
    }

    if (!dataUrl.startsWith("data:")) {
      return { error: "Attachment data is invalid" };
    }

    return {
      attachment: {
        fileName: fileName.trim().slice(0, 180),
        mimeType: mimeType.trim().slice(0, 120),
        size: normalizedSize,
        dataUrl,
      },
    };
  };

  const resolveMessageType = (attachment, requestedType = "text") => {
    if (!attachment) return "text";
    if (attachment.mimeType?.startsWith("image/")) return "image";
    return requestedType === "audio" || requestedType === "video" ? requestedType : "file";
  };

  // middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded.id).select(
        "_id username email authVersion",
      );

      if (!user) return next(new Error("User not found"));
      if ((decoded.authVersion ?? 0) !== (user.authVersion || 0)) {
        return next(new Error("Authentication failed"));
      }

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
    socket.join(getUserSocketRoom(userId));

    const allowSocketEvent = async (
      scope,
      { limit, windowSeconds },
      { silent = false } = {},
    ) => {
      if (!rateLimiter) return true;

      const result = await rateLimiter.consume({
        scope: `socket:${scope}`,
        identifier: userId,
        limit,
        windowSeconds,
      });

      if (!result.allowed && !silent) {
        socket.emit("error", {
          code: "RATE_LIMITED",
          message: "Too many real-time actions. Please slow down",
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }

      return result.allowed;
    };

    const joinUserGroups = async () => {
      const becameOnline = await addOnlineUser(userId, socket.id);
      const groups = await Group.find({ members: socket.user._id }).select("members");

      for (const group of groups) {
        const groupId = group._id.toString();

        if (becameOnline) {
          const revision = await bumpPresenceRevision(groupId);
          io.to(groupId).emit("presence-updated", {
            groupId,
            userId,
            isOnline: true,
            revision,
          });
        }

        socket.emit(
          "online-users",
          await getPresenceSnapshot(groupId, group.members),
        );
        await socket.join(groupId);
        socket.joinedGroups.add(groupId);
      }
    };

    joinUserGroups().catch(() => {
      socket.emit("error", { message: "Failed to join your groups" });
    });

    socket.on("join-group", async (groupId) => {
      try {
        if (
          !(await allowSocketEvent(
            "join-group",
            SOCKET_EVENT_LIMITS.joinGroup,
          ))
        ) {
          return;
        }

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

        const normalizedGroupId = group._id.toString();
        const wasJoined =
          socket.joinedGroups.has(normalizedGroupId) &&
          socket.rooms.has(normalizedGroupId);

        if (!wasJoined) {
          const revision = await bumpPresenceRevision(normalizedGroupId);
          io.to(normalizedGroupId).emit("presence-updated", {
            groupId: normalizedGroupId,
            userId,
            isOnline: true,
            revision,
          });
        }

        socket.emit(
          "online-users",
          await getPresenceSnapshot(normalizedGroupId, group.members),
        );
        await socket.join(normalizedGroupId);
        socket.joinedGroups.add(normalizedGroupId);
      } catch (err) {
        socket.emit("error", { message: "Failed to join group" });
      }
    });

    socket.on(
      "send-message",
      async ({
        groupId,
        content,
        replyTo,
        messageType = "text",
        attachment,
      } = {}) => {
      try {
        if (
          !(await allowSocketEvent(
            "send-message",
            SOCKET_EVENT_LIMITS.sendMessage,
          ))
        ) {
          return;
        }

        const normalizedContent = typeof content === "string" ? content.trim() : "";
        if (!groupId || (!normalizedContent && !attachment)) {
          return socket.emit("error", {
            message: "Group ID and content are required",
          });
        }

        if (normalizedContent.length > MAX_CONTENT_LENGTH) {
          return socket.emit("error", { message: "Message is too long" });
        }

        const group = await findMemberGroup(groupId, socket.user._id);
        if (!group) {
          return socket.emit("error", { message: "Group not found or not joined" });
        }

        let replyMessage = null;
        if (replyTo) {
          replyMessage = await Message.findOne({
            _id: replyTo,
            group: groupId,
            isDeleted: false,
          });

          if (!replyMessage) {
            return socket.emit("error", { message: "Reply target not found" });
          }
        }

        const attachmentResult = validateAttachment(attachment);
        if (attachmentResult?.error) {
          return socket.emit("error", { message: attachmentResult.error });
        }

        const message = await Message.create({
          group: groupId,
          sender: socket.user._id,
          content: normalizedContent || attachmentResult?.attachment?.fileName || "Attachment",
          messageType: resolveMessageType(attachmentResult?.attachment, messageType),
          replyTo: replyMessage?._id || null,
          attachment: attachmentResult?.attachment,
        });

        await populateMessage(message);

        io.to(groupId).emit("new-message", message);
      } catch (err) {
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("edit-message", async ({ groupId, messageId, content } = {}) => {
      try {
        if (
          !(await allowSocketEvent(
            "message-mutation",
            SOCKET_EVENT_LIMITS.messageMutation,
          ))
        ) {
          return;
        }

        const normalizedContent = typeof content === "string" ? content.trim() : "";
        if (!groupId || !messageId || !normalizedContent) {
          return socket.emit("error", { message: "Edit details are required" });
        }

        if (normalizedContent.length > MAX_CONTENT_LENGTH) {
          return socket.emit("error", { message: "Message is too long" });
        }

        const group = await findMemberGroup(groupId, socket.user._id);
        if (!group) {
          return socket.emit("error", { message: "Group not found or not joined" });
        }

        const message = await Message.findOne({
          _id: messageId,
          group: groupId,
          sender: socket.user._id,
          isDeleted: false,
        });

        if (!message) {
          return socket.emit("error", { message: "Message not found or not editable" });
        }

        if (message.messageType !== "text") {
          return socket.emit("error", { message: "Only text messages can be edited" });
        }

        message.content = normalizedContent;
        message.isEdited = true;
        message.editedAt = new Date();

        await message.save();
        await populateMessage(message);

        io.to(groupId).emit("message-updated", message);
      } catch {
        socket.emit("error", { message: "Failed to edit message" });
      }
    });

    socket.on("delete-message", async ({ groupId, messageId } = {}) => {
      try {
        if (
          !(await allowSocketEvent(
            "message-mutation",
            SOCKET_EVENT_LIMITS.messageMutation,
          ))
        ) {
          return;
        }

        if (!groupId || !messageId) {
          return socket.emit("error", { message: "Delete details are required" });
        }

        const group = await findMemberGroup(groupId, socket.user._id);
        if (!group) {
          return socket.emit("error", { message: "Group not found or not joined" });
        }

        const message = await Message.findOne({
          _id: messageId,
          group: groupId,
          sender: socket.user._id,
          isDeleted: false,
        });

        if (!message) {
          return socket.emit("error", { message: "Message not found or not deletable" });
        }

        message.isDeleted = true;
        message.deletedAt = new Date();
        message.content = "[deleted]";
        message.attachment = undefined;
        message.reactions = [];

        await message.save();

        io.to(groupId).emit("message-deleted", { groupId, messageId });
      } catch {
        socket.emit("error", { message: "Failed to delete message" });
      }
    });

    socket.on("mark-read", async ({ groupId } = {}) => {
      try {
        if (
          !(await allowSocketEvent(
            "mark-read",
            SOCKET_EVENT_LIMITS.markRead,
            { silent: true },
          ))
        ) {
          return;
        }

        if (!groupId) return;

        const group = await markGroupAsRead(groupId, socket.user._id);
        if (!group) return;

        socket.emit("unread-count-updated", { groupId, unreadCount: 0 });
      } catch {
        socket.emit("error", { message: "Failed to mark group as read" });
      }
    });

    socket.on("react-message", async ({ groupId, messageId, emoji } = {}) => {
      try {
        if (
          !(await allowSocketEvent(
            "message-mutation",
            SOCKET_EVENT_LIMITS.messageMutation,
          ))
        ) {
          return;
        }

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

    socket.on("typing", async ({ groupId } = {}) => {
      if (
        !(await allowSocketEvent("typing", SOCKET_EVENT_LIMITS.typing, {
          silent: true,
        }))
      ) {
        return;
      }

      const authorizedGroupId = getAuthorizedGroupSocketRoom(socket, groupId);
      if (!authorizedGroupId) {
        return socket.emit("error", { message: "Not a group member" });
      }

      socket.to(authorizedGroupId).emit("user-typing", {
        username: socket.user.username || socket.user.email,
        userId: socket.user._id,
      });
    });

    socket.on("stop-typing", async ({ groupId } = {}) => {
      if (
        !(await allowSocketEvent("typing", SOCKET_EVENT_LIMITS.typing, {
          silent: true,
        }))
      ) {
        return;
      }

      const authorizedGroupId = getAuthorizedGroupSocketRoom(socket, groupId);
      if (!authorizedGroupId) {
        return socket.emit("error", { message: "Not a group member" });
      }

      socket.to(authorizedGroupId).emit("user-stopped-typing", {
        userId: socket.user._id,
      });
    });

    socket.on("disconnect", async () => {
      try {
        const wentOffline = await removeOnlineUser(userId, socket.id);
        if (wentOffline) {
          for (const groupId of socket.joinedGroups) {
            const revision = await bumpPresenceRevision(groupId);
            io.to(groupId).emit("presence-updated", {
              groupId,
              userId,
              isOnline: false,
              revision,
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
