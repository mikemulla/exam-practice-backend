const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

topicSchema.index({ subjectId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Topic", topicSchema);
