import { User } from "../models/user.model";
import { Group } from "../models/group.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const createGroup = asyncHandler(async (req, res) => {
  const { groupName, description } = req.body;

  if (!groupName?.trim()) {
    throw new ApiError(400, "Group name is required");
  }

  const userId = req.user._id;

  const group = await Group.create({
    groupName: groupName.trim(),
    description,
    members: [userId],
    admins: [userId],
    isDirect: false,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, group, "Group created successfully"));
});

