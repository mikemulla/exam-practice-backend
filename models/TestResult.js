const mongoose = require("mongoose");

const testResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      default: null,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 1,
    },
    timeTaken: {
      type: Number,
      required: true,
      min: 0,
      max: 86400,
    },
    mode: {
      type: String,
      enum: ["subject", "topic"],
      default: "subject",
    },
  },
  { timestamps: true },
);

testResultSchema.index({ userId: 1, createdAt: -1 });
testResultSchema.index({ userId: 1, subjectId: 1 });

module.exports = mongoose.model("TestResult", testResultSchema);
