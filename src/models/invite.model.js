import mongoose from "mongoose";
import { generateCode } from "../utils/invitecode.js";

const inviteSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      default: () => generateCode(6), 
    },

    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
    },

    maxUses: {
      type: Number,
      default: null, // null = unlimited
    },

    usedCount: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Invite", inviteSchema);
