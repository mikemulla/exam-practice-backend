const express = require("express");
const router = express.Router();
const Topic = require("../models/Topic");
const Question = require("../models/Question");
const verifyAdminToken = require("../middleware/authMiddleware");

// Add topic
router.post("/", verifyAdminToken, async (req, res) => {
  try {
    const topic = new Topic({
      subjectId: req.body.subjectId,
      name: req.body.name,
    });

    await topic.save();
    res.status(201).json(topic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all topics
router.get("/", async (req, res) => {
  try {
    const topics = await Topic.find().populate("subjectId", "name");
    res.json(topics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get topics by subject
router.get("/subject/:subjectId", async (req, res) => {
  try {
    const topics = await Topic.find({ subjectId: req.params.subjectId });
    res.json(topics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get one topic by ID
router.get("/:id", async (req, res) => {
  try {
    const topic = await Topic.findById(req.params.id).populate(
      "subjectId",
      "name",
    );

    if (!topic) {
      return res.status(404).json({ message: "Topic not found" });
    }

    res.json(topic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update topic
router.put("/:id", verifyAdminToken, async (req, res) => {
  try {
    const updatedTopic = await Topic.findByIdAndUpdate(
      req.params.id,
      {
        subjectId: req.body.subjectId,
        name: req.body.name,
      },
      { new: true, runValidators: true },
    );

    if (!updatedTopic) {
      return res.status(404).json({ message: "Topic not found" });
    }

    res.json(updatedTopic);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete topic and related questions
router.delete("/:id", verifyAdminToken, async (req, res) => {
  try {
    const topicId = req.params.id;

    const deletedTopic = await Topic.findByIdAndDelete(topicId);

    if (!deletedTopic) {
      return res.status(404).json({ message: "Topic not found" });
    }

    await Question.deleteMany({ topicId });

    res.json({
      message: "Topic and related questions deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
