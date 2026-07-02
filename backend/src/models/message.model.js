import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Don't add "receiver" field as a group can have many members
    // even a direct chat is a group chat with 2 members

    content: {
      type: String,
      required: true,
    },

    // For messages other than simple text, it can be from system or any other message type
    messageType: {
      type: String,
      enum: ["text", "system", "image", "audio", "video", "file"],
      default: "text",
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Message", messageSchema);
