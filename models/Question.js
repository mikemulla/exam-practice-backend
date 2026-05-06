const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
      index: true,
    },
    questionText: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator(options) {
          return Array.isArray(options) && options.length >= 2 && options.length <= 6;
        },
        message: "Provide between 2 and 6 options",
      },
    },
    correctAnswer: {
      type: String,
      required: true,
      trim: true,
    },
    explanation: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional question image stored directly in MongoDB as base64.
    // Field names used by frontend and test page:
    // imageData + imageContentType
    imageData: {
      type: String,
      default: "",
    },
    imageContentType: {
      type: String,
      default: "",
    },
    imageOriginalName: {
      type: String,
      default: "",
    },
    imageSize: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

questionSchema.index({ subjectId: 1, topicId: 1 });

module.exports = mongoose.model("Question", questionSchema);
