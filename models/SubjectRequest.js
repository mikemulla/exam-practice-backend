const mongoose = require("mongoose");

const subjectRequestSchema = new mongoose.Schema(
  {
    subject: {
      type: String,

      required: true,

      trim: true,
    },

    topic: {
      type: String,

      required: true,

      trim: true,
    },

    timer: {
      type: Number,

      required: true,
    },

    fileName: {
      type: String,

      default: "",
    },

    fileSize: {
      type: Number,

      default: 0,
    },

    fileType: {
      type: String,

      default: "",
    },

    status: {
      type: String,

      enum: ["pending", "reviewed"],

      default: "pending",
    },
  },

  { timestamps: true },
);

module.exports = mongoose.model("SubjectRequest", subjectRequestSchema);
