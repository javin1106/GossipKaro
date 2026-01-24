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
  const userId = req.user;

  if (!group.members.includes(userId)) {
    throw new ApiError(400, "The admin should be a part of group");
  }

  const invite = await Invite.create({
    group: groupId,
    createdBy: userId,
  });

  res.status(201).json(new ApiResponse(201, invite, "Invite is created"));
});

export const joinInvite = asyncHandler(async(req, res) => {
    
})