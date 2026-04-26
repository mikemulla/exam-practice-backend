const express = require("express");
const router = express.Router();
const Question = require("../models/Question");
const verifyAdminToken = require("../middleware/authMiddleware");

// Add question
router.post("/", verifyAdminToken, async (req, res) => {
  try {
    const question = new Question({
      subjectId: req.body.subjectId,
      topicId: req.body.topicId,
      questionText: req.body.questionText,
      options: req.body.options,
      correctAnswer: req.body.correctAnswer,
      explanation: req.body.explanation,
    });

    await question.save();
    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Bulk add questions
router.post("/bulk", verifyAdminToken, async (req, res) => {
  try {
    const { subjectId, questions } = req.body;

    if (!subjectId) {
      return res.status(400).json({ message: "subjectId is required" });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res
        .status(400)
        .json({ message: "questions must be a non-empty array" });
    }

    const formattedQuestions = questions.map((question) => ({
      subjectId,
      topicId: question.topicId,
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    }));

    const savedQuestions = await Question.insertMany(formattedQuestions);

    res.status(201).json({
      message: `${savedQuestions.length} questions imported successfully`,
      savedQuestions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all questions
router.get("/", async (req, res) => {
  try {
    const questions = await Question.find()
      .populate("subjectId", "name")
      .populate("topicId", "name");
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get questions by subject
router.get("/subject/:subjectId", async (req, res) => {
  try {
    const questions = await Question.find({
      subjectId: req.params.subjectId,
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get one question by ID
router.get("/:id", async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    res.json(question);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update question
router.put("/:id", verifyAdminToken, async (req, res) => {
  try {
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      {
        subjectId: req.body.subjectId,
        topicId: req.body.topicId,
        questionText: req.body.questionText,
        options: req.body.options,
        correctAnswer: req.body.correctAnswer,
        explanation: req.body.explanation,
      },
      { new: true, runValidators: true },
    );

    res.json(updatedQuestion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete question
router.put("/:id", verifyAdminToken, async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: "Question deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get questions by topic
router.get("/topic/:topicId", async (req, res) => {
  try {
    const questions = await Question.find({ topicId: req.params.topicId });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
