const express = require("express");
const mongoose = require("mongoose");
const Question = require("../models/Question");
const Topic = require("../models/Topic");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { verifyAdminToken, verifyUserToken } = require("../middleware/authMiddleware");
const { adminLimiter } = require("../middleware/rateLimiter");
const {
  questionValidation,
  bulkQuestionValidation,
  validObjectId,
  paginationValidation,
} = require("../middleware/validators");

const router = express.Router();

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

async function validateQuestionRelationship(subjectId, topicId) {
  const [subject, topic] = await Promise.all([
    Subject.findById(subjectId),
    Topic.findById(topicId),
  ]);

  if (!subject) return { ok: false, status: 400, message: "Subject not found" };
  if (!topic) return { ok: false, status: 400, message: "Topic not found" };
  if (topic.subjectId.toString() !== subject._id.toString()) {
    return { ok: false, status: 400, message: "Topic does not belong to selected subject" };
  }

  return { ok: true };
}

router.post("/", verifyAdminToken, questionValidation, async (req, res) => {
  try {
    const { subjectId, topicId, questionText, options, correctAnswer, explanation } = req.body;

    const relationship = await validateQuestionRelationship(subjectId, topicId);
    if (!relationship.ok) {
      return res.status(relationship.status).json({ message: relationship.message });
    }

    const question = await Question.create({
      subjectId,
      topicId,
      questionText: questionText.trim(),
      options: options.map((option) => option.trim()),
      correctAnswer: correctAnswer.trim(),
      explanation: explanation.trim(),
    });

    res.status(201).json(question);
  } catch (error) {
    console.error("Save question error:", error);
    res.status(500).json({ message: "Failed to save question" });
  }
});

router.post("/bulk", verifyAdminToken, adminLimiter, bulkQuestionValidation, async (req, res) => {
  try {
    const { subjectId, questions } = req.body;

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(400).json({ message: "Subject not found" });
    }

    const topicIds = [...new Set(questions.map((question) => String(question.topicId)) )];
    const topics = await Topic.find({ _id: { $in: topicIds }, subjectId }).select("_id");
    const validTopicIds = new Set(topics.map((topic) => topic._id.toString()));

    const invalidTopic = topicIds.find((topicId) => !validTopicIds.has(topicId));
    if (invalidTopic) {
      return res.status(400).json({ message: "Every imported topic must belong to the selected subject" });
    }

    const formattedQuestions = questions.map((question) => ({
      subjectId,
      topicId: question.topicId,
      questionText: question.questionText.trim(),
      options: question.options.map((option) => String(option).trim()).filter(Boolean),
      correctAnswer: question.correctAnswer.trim(),
      explanation: question.explanation.trim(),
    }));

    const savedQuestions = await Question.insertMany(formattedQuestions, { ordered: true });

    res.status(201).json({
      message: `${savedQuestions.length} questions imported successfully`,
      savedQuestions,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    res.status(500).json({ message: "Failed to import questions" });
  }
});

router.delete("/bulk", verifyAdminToken, adminLimiter, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];

    if (ids.length === 0) {
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }

    if (ids.length > 200) {
      return res.status(400).json({ message: "Cannot delete more than 200 questions at once" });
    }

    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: "Invalid question ID in request" });
    }

    const result = await Question.deleteMany({ _id: { $in: ids } });
    res.json({ message: `${result.deletedCount} questions deleted successfully`, deletedCount: result.deletedCount });
  } catch (error) {
    console.error("Bulk delete questions error:", error);
    res.status(500).json({ message: "Failed to delete questions" });
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

    if (req.query.topicId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.topicId)) {
        return res.status(400).json({ message: "Invalid topic ID" });
      }
      query.topicId = req.query.topicId;
    }

    const [questions, total] = await Promise.all([
      Question.find(query)
        .populate("subjectId", "name level courseId")
        .populate("topicId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Question.countDocuments(query),
    ]);

    res.json({ data: questions, questions, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Admin fetch questions error:", error);
    res.status(500).json({ message: "Failed to fetch questions" });
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

    const questions = await Question.find({ subjectId: req.params.subjectId });
    res.json(questions);
  } catch (error) {
    console.error("Fetch subject questions error:", error);
    res.status(500).json({ message: "Failed to fetch questions" });
  }
});

router.get("/topic/:topicId", verifyUserToken, validObjectId("topicId"), async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const topic = await Topic.findById(req.params.topicId).populate("subjectId");
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    if (!topic.subjectId) return res.status(404).json({ message: "Subject not found" });

    const allowed =
      topic.subjectId.courseId.toString() === user.courseId.toString() &&
      Number(topic.subjectId.level) === Number(user.level);

    if (!allowed) {
      return res.status(403).json({ message: "You are not allowed to access this topic" });
    }

    const questions = await Question.find({ topicId: req.params.topicId });
    res.json(questions);
  } catch (error) {
    console.error("Fetch topic questions error:", error);
    res.status(500).json({ message: "Failed to fetch questions" });
  }
});

router.get("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate("subjectId", "name")
      .populate("topicId", "name");

    if (!question) return res.status(404).json({ message: "Question not found" });
    res.json(question);
  } catch (error) {
    console.error("Fetch question error:", error);
    res.status(500).json({ message: "Failed to fetch question" });
  }
});

router.put("/:id", verifyAdminToken, validObjectId("id"), questionValidation, async (req, res) => {
  try {
    const { subjectId, topicId, questionText, options, correctAnswer, explanation } = req.body;

    const relationship = await validateQuestionRelationship(subjectId, topicId);
    if (!relationship.ok) {
      return res.status(relationship.status).json({ message: relationship.message });
    }

    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      {
        subjectId,
        topicId,
        questionText: questionText.trim(),
        options: options.map((option) => option.trim()),
        correctAnswer: correctAnswer.trim(),
        explanation: explanation.trim(),
      },
      { new: true, runValidators: true },
    );

    if (!updatedQuestion) return res.status(404).json({ message: "Question not found" });
    res.json(updatedQuestion);
  } catch (error) {
    console.error("Update question error:", error);
    res.status(500).json({ message: "Failed to update question" });
  }
});

router.delete("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) return res.status(404).json({ message: "Question not found" });
    res.json({ message: "Question deleted successfully" });
  } catch (error) {
    console.error("Delete question error:", error);
    res.status(500).json({ message: "Failed to delete question" });
  }
});

module.exports = router;
