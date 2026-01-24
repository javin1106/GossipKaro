import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Group from "../models/group.model.js";
import Invite from "../models/invite.model.js";

export const createInvite = asyncHandler(async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) {
    throw new ApiError(400, "Group ID is required");
  }

  const group = await Group.findById(groupId);
  const userId = req.user._id;

  const isMember = group.members.some(
    (memberId) => memberId.toString() === userId.toString(),
  );

  if (!isMember) {
    throw new ApiError(403, "You must be a group member to create an invite");
  }

  const invite = await Invite.create({
    group: groupId,
    createdBy: userId,
  });

  res.status(201).json(new ApiResponse(201, invite, "Invite is created"));
});

export const joinInvite = asyncHandler(async (req, res) => {
  const { code } = req.params;

  if (!code) {
    throw new ApiError(400, "Invite code is required");
  }

  const invite = await Invite.findOne({ code });
  if (!invite) {
    throw new ApiError(404, "Invalid invite code");
  }

  if (!invite.isActive) {
    throw new ApiError(400, "The invite code has expired");
  }

  const group = await Group.findById(invite.group);
  if (!group) {
    throw new ApiError(404, "Group not found");
  }

  const userId = req.user._id;

  const isMember = group.members.some(
    (memberId) => memberId.toString() === userId.toString(),
  );

  if (isMember) {
    return res
      .status(200)
      .json(new ApiResponse(200, group, "Already a group member"));
  }

  group.members.push(userId);
  await group.save();

  return res
    .status(200)
    .json(new ApiResponse(200, group, "Joined the group successfully"));
});
