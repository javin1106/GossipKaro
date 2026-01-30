import Group from "../models/group.model.js";
import Message from "../models/message.model.js";
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

export const getMessages = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  if (!groupId) {
    throw new ApiError(400, "Group ID is required");
  }

  const group = await Group.findById(groupId);

  if (!group) {
    throw new ApiError(404, "Group not found");
  }

  const isMember = group.members.some(
    (memberId) => memberId.toString() === userId.toString(),
  );

  if (!isMember) {
    throw new ApiError(403, "You are not a member of this group");
  }

  // Pagination
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Fetch all messages
  const messages = await Message.find({ group: groupId })
    .sort({
      createdAt: -1,
    })
    .skip(skip)
    .limit(limit)
    .populate("sender", "username email");

  const totalMessages = await Message.countDocuments({ group: groupId });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        messages: messages,
        pagination: {
          page,

          limit,
          total: totalMessages,
          totalPages: Math.ceil(totalMessages / limit),
        },
      },
      "Messages retreived successfully",
    ),
  );
});

export const getGroupDetails = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;
  if (!groupId) throw new ApiError(400, "Group ID is required");

  const group = await Group.findById(groupId).populate("members", "username");

  if (!group) {
    throw new ApiError(404, "Group not found");
  }

  const isMember = group.members.some(
    (memberId) => memberId.toString() === userId.toString(),
  );

  if (!isMember) {
    throw new ApiError(403, "You are not a member of this group");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        group,
      },
      "Group details fetched successfully",
    ),
  );
});

export const leaveGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user._id;

  if (!groupId) {
    throw new ApiError(400, "Group ID is required");
  }

  const group = await Group.findById(groupId);

  if (!group) {
    throw new ApiError(404, "Group not found");
  }

  const isMember = group.members.some(
    (memberId) => memberId.toString() === userId.toString(),
  );

  if (!isMember) {
    throw new ApiError(400, "You are not a member of this group");
  }

  const isAdmin = group.admins.some(
    (adminId) => adminId.toString() === userId.toString(),
  );

  // If user is the only admin, promote a random member before leaving
  if (isAdmin && group.admins.length === 1) {
    // Find other members who can become admin
    const otherMembers = group.members.filter(
      (memberId) => memberId.toString() !== userId.toString(),
    );

    if (otherMembers.length === 0) {
      // Last member in group, can delete the group or just leave
      await Group.findByIdAndDelete(groupId);
      return res
        .status(200)
        .json(new ApiResponse(200, null, "Group deleted as you were the last member"));
    }

    // Promote random member to admin
    const randomIndex = Math.floor(Math.random() * otherMembers.length);
    const newAdmin = otherMembers[randomIndex];
    group.admins.push(newAdmin);
  }

  // Remove user from members
  group.members = group.members.filter(
    (memberId) => memberId.toString() !== userId.toString(),
  );

  // If user was admin, remove from admins
  group.admins = group.admins.filter(
    (adminId) => adminId.toString() !== userId.toString(),
  );

  await group.save();

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Left group successfully"));
});

export const getUserGroups = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  const groups = await Group.find({
    members: userId,
  })
    .populate("members", "username email")
    .populate("admins", "username email")
    .sort({ updatedAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, groups, "User's groups fetched successfully"));
});
