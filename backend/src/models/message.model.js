import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
    },
    size: {
      type: Number,
    },
    dataUrl: {
      type: String,
    },
  },
  { _id: false },
);

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

    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    attachment: {
      type: attachmentSchema,
      default: undefined,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },

    editedAt: {
      type: Date,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
    },

    reactions: [
      {
        emoji: {
          type: String,
          required: true,
          trim: true,
          maxlength: 16,
        },
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

messageSchema.index({ group: 1, createdAt: -1 });

export default mongoose.model("Message", messageSchema);
