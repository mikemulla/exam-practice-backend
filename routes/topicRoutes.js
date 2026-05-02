const express = require("express");
const mongoose = require("mongoose");
const Topic = require("../models/Topic");
const Question = require("../models/Question");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { verifyAdminToken, verifyUserToken } = require("../middleware/authMiddleware");
const { topicValidation, validObjectId, paginationValidation } = require("../middleware/validators");

const router = express.Router();

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

router.post("/", verifyAdminToken, topicValidation, async (req, res) => {
  try {
    const { subjectId, name } = req.body;

    const subjectExists = await Subject.exists({ _id: subjectId });
    if (!subjectExists) {
      return res.status(400).json({ message: "Subject not found" });
    }

    const topic = await Topic.create({ subjectId, name: name.trim() });
    res.status(201).json(topic);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Topic already exists for this subject" });
    }

    console.error("Create topic error:", error);
    res.status(500).json({ message: "Failed to create topic" });
  }
});

router.get("/admin/all", verifyAdminToken, paginationValidation, async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const query = {};

    if (req.query.subjectId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.subjectId)) {
        return res.status(400).json({ message: "Invalid subject ID" });
      }
      query.subjectId = req.query.subjectId;
    }

    const [topics, total] = await Promise.all([
      Topic.find(query)
        .populate({
          path: "subjectId",
          select: "name courseId level",
          populate: { path: "courseId", select: "name" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Topic.countDocuments(query),
    ]);

    res.json({ data: topics, topics, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin fetch topics error:", error);
    res.status(500).json({ message: "Failed to fetch topics" });
  }
});

router.get("/", verifyUserToken, paginationValidation, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const requestedIds = String(req.query.subjectIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (requestedIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: "Invalid subject ID" });
    }

    const subjectQuery = { courseId: user.courseId, level: user.level };
    if (requestedIds.length > 0) {
      subjectQuery._id = { $in: requestedIds };
    }

    const subjects = await Subject.find(subjectQuery).select("_id");
    const allowedSubjectIds = subjects.map((subject) => subject._id);

    const { page, limit, skip } = getPagination(req);
    const topicQuery = { subjectId: { $in: allowedSubjectIds } };

    const [topics, total] = await Promise.all([
      Topic.find(topicQuery).sort({ name: 1 }).skip(skip).limit(limit),
      Topic.countDocuments(topicQuery),
    ]);

    res.json({ data: topics, topics, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Fetch topics error:", error);
    res.status(500).json({ message: "Failed to fetch topics" });
  }
});

router.get("/subject/:subjectId", verifyUserToken, validObjectId("subjectId"), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const subject = await Subject.findOne({
      _id: req.params.subjectId,
      courseId: user.courseId,
      level: user.level,
    });

    if (!subject) {
      return res.status(403).json({ message: "You are not allowed to access this subject" });
    }

    const topics = await Topic.find({ subjectId: req.params.subjectId }).sort({ name: 1 });
    res.json(topics);
  } catch (error) {
    console.error("Fetch subject topics error:", error);
    res.status(500).json({ message: "Failed to fetch topics" });
  }
});

router.get("/:id", verifyUserToken, validObjectId("id"), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const topic = await Topic.findById(req.params.id).populate("subjectId");
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    if (!topic.subjectId) return res.status(404).json({ message: "Subject not found" });

    const allowed =
      topic.subjectId.courseId.toString() === user.courseId.toString() &&
      Number(topic.subjectId.level) === Number(user.level);

    if (!allowed) {
      return res.status(403).json({ message: "You are not allowed to access this topic" });
    }

    res.json(topic);
  } catch (error) {
    console.error("Fetch topic error:", error);
    res.status(500).json({ message: "Failed to fetch topic" });
  }
});

router.put("/:id", verifyAdminToken, validObjectId("id"), topicValidation, async (req, res) => {
  try {
    const { subjectId, name } = req.body;

    const subjectExists = await Subject.exists({ _id: subjectId });
    if (!subjectExists) {
      return res.status(400).json({ message: "Subject not found" });
    }

    const updatedTopic = await Topic.findByIdAndUpdate(
      req.params.id,
      { subjectId, name: name.trim() },
      { new: true, runValidators: true },
    );

    if (!updatedTopic) return res.status(404).json({ message: "Topic not found" });

    res.json(updatedTopic);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Topic already exists for this subject" });
    }

    console.error("Update topic error:", error);
    res.status(500).json({ message: "Failed to update topic" });
  }
});

router.delete("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const topicId = req.params.id;

    const deletedTopic = await Topic.findByIdAndDelete(topicId);
    if (!deletedTopic) return res.status(404).json({ message: "Topic not found" });

    await Question.deleteMany({ topicId });

    res.json({ message: "Topic and related questions deleted successfully" });
  } catch (error) {
    console.error("Delete topic error:", error);
    res.status(500).json({ message: "Failed to delete topic" });
  }
});

module.exports = router;
