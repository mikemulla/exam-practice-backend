const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    duration: {
      type: Number,
      default: 300,
      min: 60,
      max: 7200,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    level: {
      type: Number,
      required: true,
      enum: [100, 200, 300, 400, 500, 600],
      index: true,
    },
  },
  { timestamps: true },
);

subjectSchema.index({ name: 1, courseId: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("Subject", subjectSchema);
