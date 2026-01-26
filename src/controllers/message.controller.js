import Message from "../models/message.model.js";
import Group from "../models/group.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const sendMessage = asyncHandler(async (req, res) => {
  const { groupId, content } = req.body;
  const userId = req.user._id;

  if (!groupId || !content?.trim()) {
    throw new ApiError(400, "Group ID and message content are required");
  }

  const group = await Group.findById(groupId);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }

  const isMember = group.members.some(
    (memberId) => userId.toString() === memberId.toString()
  );

  if (!isMember) {
    throw new ApiError(403, "You are not a member of this group");
  }

  const message = await Message.create({
    group: groupId,
    content: content.trim(),
    sender: userId,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, message, "Message sent successfully"));
});

