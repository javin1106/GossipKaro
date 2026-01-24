import mongoose from "mongoose";
import { User } from "./user.model.js";

const groupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      trim: true,
      maxLength: 50,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    isDirect: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Group", groupSchema);
