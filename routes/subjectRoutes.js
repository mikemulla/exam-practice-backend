const express = require("express");
const mongoose = require("mongoose");
const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const Question = require("../models/Question");
const User = require("../models/User");
const Course = require("../models/Course");
const { verifyUserToken, verifyAdminToken } = require("../middleware/authMiddleware");
const { subjectValidation, validObjectId, paginationValidation } = require("../middleware/validators");

const router = express.Router();

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

router.get("/admin/all", verifyAdminToken, paginationValidation, async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const query = {};

    if (req.query.courseId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.courseId)) {
        return res.status(400).json({ message: "Invalid course ID" });
      }
      query.courseId = req.query.courseId;
    }

    if (req.query.level) {
      const level = Number(req.query.level);
      if (![100, 200, 300, 400, 500, 600].includes(level)) {
        return res.status(400).json({ message: "Invalid level" });
      }
      query.level = level;
    }

    const [subjects, total] = await Promise.all([
      Subject.find(query).populate("courseId", "name").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Subject.countDocuments(query),
    ]);

    res.json({ data: subjects, subjects, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin fetch subjects error:", error);
    res.status(500).json({ message: "Failed to fetch subjects" });
  }
});

router.get("/", verifyUserToken, paginationValidation, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const { page, limit, skip } = getPagination(req);
    const query = { courseId: user.courseId, level: user.level };

    const [subjects, total] = await Promise.all([
      Subject.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Subject.countDocuments(query),
    ]);

    res.json({ data: subjects, subjects, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Fetch subjects error:", error);
    res.status(500).json({ message: "Failed to fetch subjects" });
  }
});

router.get("/:id", verifyUserToken, validObjectId("id"), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const subject = await Subject.findById(req.params.id);
    if (!subject) return res.status(404).json({ message: "Subject not found" });

    const allowed =
      subject.courseId.toString() === user.courseId.toString() && Number(subject.level) === Number(user.level);

    if (!allowed) {
      return res.status(403).json({ message: "You are not allowed to access this subject" });
    }

    res.json(subject);
  } catch (error) {
    console.error("Fetch subject error:", error);
    res.status(500).json({ message: "Failed to fetch subject" });
  }
});

router.post("/", verifyAdminToken, subjectValidation, async (req, res) => {
  try {
    const { name, courseId, level, duration } = req.body;

    const courseExists = await Course.exists({ _id: courseId });
    if (!courseExists) {
      return res.status(400).json({ message: "Course not found" });
    }

    const subject = await Subject.create({
      name: name.trim(),
      courseId,
      level: Number(level),
      duration: duration || 300,
    });

    res.status(201).json(subject);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Subject already exists for this course and level" });
    }

    console.error("Create subject error:", error);
    res.status(500).json({ message: "Failed to create subject" });
  }
});

router.put("/:id", verifyAdminToken, validObjectId("id"), subjectValidation, async (req, res) => {
  try {
    const { name, courseId, level, duration } = req.body;

    const courseExists = await Course.exists({ _id: courseId });
    if (!courseExists) {
      return res.status(400).json({ message: "Course not found" });
    }

    const updated = await Subject.findByIdAndUpdate(
      req.params.id,
      { name: name.trim(), courseId, level: Number(level), duration },
      { new: true, runValidators: true },
    );

    if (!updated) return res.status(404).json({ message: "Subject not found" });

    res.json(updated);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Subject already exists for this course and level" });
    }

    console.error("Update subject error:", error);
    res.status(500).json({ message: "Failed to update subject" });
  }
});

router.delete("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const deleted = await Subject.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Subject not found" });

    await Promise.all([
      Topic.deleteMany({ subjectId: req.params.id }),
      Question.deleteMany({ subjectId: req.params.id }),
    ]);

    res.json({ message: "Subject, topics, and related questions deleted successfully" });
  } catch (error) {
    console.error("Delete subject error:", error);
    res.status(500).json({ message: "Failed to delete subject" });
  }
});

module.exports = router;
