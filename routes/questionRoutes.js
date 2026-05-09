const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");

const Question = require("../models/Question");
const Topic = require("../models/Topic");
const Subject = require("../models/Subject");
const User = require("../models/User");

const {
  verifyAdminToken,
  verifyUserToken,
} = require("../middleware/authMiddleware");
const { adminLimiter } = require("../middleware/rateLimiter");
const {
  bulkQuestionValidation,
  validObjectId,
  paginationValidation,
} = require("../middleware/validators");

const router = express.Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const uploadQuestionImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error("Unsupported image type. Upload JPG, PNG, or WEBP only."),
        false,
      );
    }
  },
});

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function parseJsonField(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cleanString(value) {
  return String(value || "").trim();
}

function buildImagePayload(file) {
  if (!file) {
    return {
      imageData: "",
      imageContentType: "",
      imageOriginalName: "",
      imageSize: 0,
    };
  }

  return {
    imageData: file.buffer.toString("base64"),
    imageContentType: file.mimetype,
    imageOriginalName: file.originalname,
    imageSize: file.size,
  };
}

function isImageMagicBytesAllowed(file) {
  if (!file) return true;

  const buffer = file.buffer;
  if (!buffer || buffer.length < 12) return false;

  if (file.mimetype === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (file.mimetype === "image/png") {
    return buffer.subarray(0, 4).toString("hex").toLowerCase() === "89504e47";
  }

  if (file.mimetype === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("utf8") === "RIFF" &&
      buffer.subarray(8, 12).toString("utf8") === "WEBP"
    );
  }

  return false;
}

function addImageMetadata(question) {
  if (!question) return question;

  const plainQuestion =
    typeof question.toObject === "function" ? question.toObject() : question;

  return {
    ...plainQuestion,
    hasImage: Boolean(plainQuestion.imageContentType || plainQuestion.imageSize),
  };
}

function lightQuestionResponse(question) {
  const plainQuestion =
    typeof question.toObject === "function" ? question.toObject() : question;

  if (!plainQuestion) return null;

  const { imageData, ...withoutImageData } = plainQuestion;
  return addImageMetadata(withoutImageData);
}

function validateQuestionPayload({
  subjectId,
  topicId,
  questionText,
  options,
  correctAnswer,
  explanation,
}) {
  if (!mongoose.Types.ObjectId.isValid(subjectId)) {
    return "Subject is required";
  }

  if (!mongoose.Types.ObjectId.isValid(topicId)) {
    return "Topic is required";
  }

  if (!cleanString(questionText)) {
    return "Question text is required";
  }

  if (cleanString(questionText).length > 2000) {
    return "Question too long";
  }

  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    return "Provide between 2 and 6 options";
  }

  const cleanedOptions = options
    .map((option) => cleanString(option))
    .filter(Boolean);

  if (cleanedOptions.length !== options.length || cleanedOptions.length < 2) {
    return "All options must be non-empty strings";
  }

  if (!cleanString(correctAnswer)) {
    return "Correct answer is required";
  }

  if (!cleanedOptions.includes(cleanString(correctAnswer))) {
    return "Correct answer must match one of the options";
  }

  if (!cleanString(explanation)) {
    return "Explanation is required";
  }

  if (cleanString(explanation).length > 3000) {
    return "Explanation too long";
  }

  return null;
}

async function validateQuestionRelationship(subjectId, topicId) {
  const [subject, topic] = await Promise.all([
    Subject.findById(subjectId),
    Topic.findById(topicId),
  ]);

  if (!subject) {
    return { ok: false, status: 400, message: "Subject not found" };
  }

  if (!topic) {
    return { ok: false, status: 400, message: "Topic not found" };
  }

  if (topic.subjectId.toString() !== subject._id.toString()) {
    return {
      ok: false,
      status: 400,
      message: "Topic does not belong to selected subject",
    };
  }

  return { ok: true };
}

async function userCanAccessQuestion(userId, questionId) {
  const user = await User.findById(userId);
  if (!user) return false;

  const question = await Question.findById(questionId)
    .select("subjectId")
    .populate("subjectId", "courseId level");

  if (!question || !question.subjectId) return false;

  return (
    question.subjectId.courseId.toString() === user.courseId.toString() &&
    Number(question.subjectId.level) === Number(user.level)
  );
}

// TEMP DEBUG ROUTE: remove after confirming images are saving.
router.get("/debug-images", async (_req, res) => {
  try {
    const questions = await Question.find()
      .select("questionText imageData imageContentType imageOriginalName imageSize")
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .lean();

    res.json(
      questions.map((q) => ({
        id: q._id,
        questionText: q.questionText,
        hasImageData: !!q.imageData,
        imageContentType: q.imageContentType || null,
        imageOriginalName: q.imageOriginalName || null,
        imageSize: q.imageSize || 0,
        imageDataLength: q.imageData ? q.imageData.length : 0,
      })),
    );
  } catch (error) {
    console.error("Debug images error:", error);
    res.status(500).json({ message: "Failed to debug question images" });
  }
});

router.post(
  "/",
  verifyAdminToken,
  uploadQuestionImage.single("image"),
  async (req, res) => {
    try {
      const subjectId = cleanString(req.body.subjectId);
      const topicId = cleanString(req.body.topicId);
      const questionText = cleanString(req.body.questionText);
      const options = parseJsonField(req.body.options, []);
      const correctAnswer = cleanString(req.body.correctAnswer);
      const explanation = cleanString(req.body.explanation);

      if (req.file && !isImageMagicBytesAllowed(req.file)) {
        return res.status(400).json({
          message: "Uploaded image content does not match the selected image type.",
        });
      }

      const validationError = validateQuestionPayload({
        subjectId,
        topicId,
        questionText,
        options,
        correctAnswer,
        explanation,
      });

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const relationship = await validateQuestionRelationship(subjectId, topicId);
      if (!relationship.ok) {
        return res
          .status(relationship.status)
          .json({ message: relationship.message });
      }

      const question = await Question.create({
        subjectId,
        topicId,
        questionText,
        options: options.map((option) => cleanString(option)),
        correctAnswer,
        explanation,
        ...buildImagePayload(req.file),
      });

      res.status(201).json(lightQuestionResponse(question));
    } catch (error) {
      console.error("Save question error:", error);
      res.status(500).json({ message: "Failed to save question" });
    }
  },
);

router.post(
  "/bulk",
  verifyAdminToken,
  adminLimiter,
  bulkQuestionValidation,
  async (req, res) => {
    try {
      const { subjectId, questions } = req.body;

      const subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(400).json({ message: "Subject not found" });
      }

      const topicIds = [
        ...new Set(questions.map((question) => String(question.topicId))),
      ];

      const topics = await Topic.find({
        _id: { $in: topicIds },
        subjectId,
      }).select("_id");

      const validTopicIds = new Set(topics.map((topic) => topic._id.toString()));

      const invalidTopic = topicIds.find(
        (topicId) => !validTopicIds.has(topicId),
      );

      if (invalidTopic) {
        return res.status(400).json({
          message: "Every imported topic must belong to the selected subject",
        });
      }

      const formattedQuestions = questions.map((question) => ({
        subjectId,
        topicId: question.topicId,
        questionText: question.questionText.trim(),
        options: question.options
          .map((option) => String(option).trim())
          .filter(Boolean),
        correctAnswer: question.correctAnswer.trim(),
        explanation: question.explanation.trim(),
        imageData: "",
        imageContentType: "",
        imageOriginalName: "",
        imageSize: 0,
      }));

      const savedQuestions = await Question.insertMany(formattedQuestions, {
        ordered: true,
      });

      res.status(201).json({
        message: `${savedQuestions.length} questions imported successfully`,
        count: savedQuestions.length,
      });
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ message: "Failed to import questions" });
    }
  },
);

router.delete("/bulk", verifyAdminToken, adminLimiter, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];

    if (ids.length === 0) {
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }

    if (ids.length > 200) {
      return res.status(400).json({
        message: "Cannot delete more than 200 questions at once",
      });
    }

    if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({
        message: "Invalid question ID in request",
      });
    }

    const result = await Question.deleteMany({ _id: { $in: ids } });

    res.json({
      message: `${result.deletedCount} questions deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Bulk delete questions error:", error);
    res.status(500).json({ message: "Failed to delete questions" });
  }
});

router.get(
  "/admin/all",
  verifyAdminToken,
  paginationValidation,
  async (req, res) => {
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
          .select("-imageData")
          .populate("subjectId", "name level courseId")
          .populate("topicId", "name")
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Question.countDocuments(query),
      ]);

      const safeQuestions = questions.map(addImageMetadata);

      res.json({
        data: safeQuestions,
        questions: safeQuestions,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Admin fetch questions error:", error);
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  },
);

router.get(
  "/subject/:subjectId",
  verifyUserToken,
  validObjectId("subjectId"),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const subject = await Subject.findOne({
        _id: req.params.subjectId,
        courseId: user.courseId,
        level: user.level,
      });

      if (!subject) {
        return res.status(403).json({
          message: "You are not allowed to access this subject",
        });
      }

      const questions = await Question.find({
        subjectId: req.params.subjectId,
      })
        .select("-imageData")
        .sort({ createdAt: -1, _id: -1 })
        .lean();

      res.json(questions.map(addImageMetadata));
    } catch (error) {
      console.error("Fetch subject questions error:", error);
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  },
);

router.get(
  "/topic/:topicId",
  verifyUserToken,
  validObjectId("topicId"),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const topic = await Topic.findById(req.params.topicId).populate(
        "subjectId",
      );

      if (!topic) return res.status(404).json({ message: "Topic not found" });

      if (!topic.subjectId) {
        return res.status(404).json({ message: "Subject not found" });
      }

      const allowed =
        topic.subjectId.courseId.toString() === user.courseId.toString() &&
        Number(topic.subjectId.level) === Number(user.level);

      if (!allowed) {
        return res.status(403).json({
          message: "You are not allowed to access this topic",
        });
      }

      const questions = await Question.find({ topicId: req.params.topicId })
        .select("-imageData")
        .sort({ createdAt: -1, _id: -1 })
        .lean();

      res.json(questions.map(addImageMetadata));
    } catch (error) {
      console.error("Fetch topic questions error:", error);
      res.status(500).json({ message: "Failed to fetch questions" });
    }
  },
);

router.get(
  "/:id/image",
  verifyUserToken,
  validObjectId("id"),
  async (req, res) => {
    try {
      const allowed = await userCanAccessQuestion(req.userId, req.params.id);

      if (!allowed) {
        return res.status(403).json({
          message: "You are not allowed to access this image",
        });
      }

      const question = await Question.findById(req.params.id).select(
        "imageData imageContentType",
      );

      if (!question || !question.imageData || !question.imageContentType) {
        return res.status(404).json({ message: "Image not found" });
      }

      res.json({
        imageData: question.imageData,
        imageContentType: question.imageContentType,
      });
    } catch (error) {
      console.error("Fetch question image error:", error);
      res.status(500).json({ message: "Failed to fetch question image" });
    }
  },
);

router.get(
  "/:id/admin-image",
  verifyAdminToken,
  validObjectId("id"),
  async (req, res) => {
    try {
      const question = await Question.findById(req.params.id).select(
        "imageData imageContentType",
      );

      if (!question || !question.imageData || !question.imageContentType) {
        return res.status(404).json({ message: "Image not found" });
      }

      res.json({
        imageData: question.imageData,
        imageContentType: question.imageContentType,
      });
    } catch (error) {
      console.error("Fetch admin question image error:", error);
      res.status(500).json({ message: "Failed to fetch question image" });
    }
  },
);

router.get("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .select("-imageData")
      .populate("subjectId", "name")
      .populate("topicId", "name")
      .lean();

    if (!question) return res.status(404).json({ message: "Question not found" });

    res.json(addImageMetadata(question));
  } catch (error) {
    console.error("Fetch question error:", error);
    res.status(500).json({ message: "Failed to fetch question" });
  }
});

router.put(
  "/:id",
  verifyAdminToken,
  validObjectId("id"),
  uploadQuestionImage.single("image"),
  async (req, res) => {
    try {
      const subjectId = cleanString(req.body.subjectId);
      const topicId = cleanString(req.body.topicId);
      const questionText = cleanString(req.body.questionText);
      const options = parseJsonField(req.body.options, []);
      const correctAnswer = cleanString(req.body.correctAnswer);
      const explanation = cleanString(req.body.explanation);

      if (req.file && !isImageMagicBytesAllowed(req.file)) {
        return res.status(400).json({
          message: "Uploaded image content does not match the selected image type.",
        });
      }

      const validationError = validateQuestionPayload({
        subjectId,
        topicId,
        questionText,
        options,
        correctAnswer,
        explanation,
      });

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const relationship = await validateQuestionRelationship(subjectId, topicId);

      if (!relationship.ok) {
        return res
          .status(relationship.status)
          .json({ message: relationship.message });
      }

      const updatePayload = {
        subjectId,
        topicId,
        questionText,
        options: options.map((option) => cleanString(option)),
        correctAnswer,
        explanation,
      };

      if (req.file) {
        Object.assign(updatePayload, buildImagePayload(req.file));
      }

      if (req.body.removeImage === "true") {
        Object.assign(updatePayload, buildImagePayload(null));
      }

      const updatedQuestion = await Question.findByIdAndUpdate(
        req.params.id,
        updatePayload,
        {
          returnDocument: "after",
          runValidators: true,
        },
      ).select("-imageData");

      if (!updatedQuestion) {
        return res.status(404).json({ message: "Question not found" });
      }

      res.json(lightQuestionResponse(updatedQuestion));
    } catch (error) {
      console.error("Update question error:", error);
      res.status(500).json({ message: "Failed to update question" });
    }
  },
);

router.delete("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);

    if (!deletedQuestion) {
      return res.status(404).json({ message: "Question not found" });
    }

    res.json({ message: "Question deleted successfully" });
  } catch (error) {
    console.error("Delete question error:", error);
    res.status(500).json({ message: "Failed to delete question" });
  }
});

router.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Image too large. Maximum size is 5MB.",
    });
  }

  if (err.message === "Unsupported image type. Upload JPG, PNG, or WEBP only.") {
    return res.status(400).json({ message: err.message });
  }

  console.error("Question upload error:", err);
  return res.status(500).json({ message: "Question image upload failed." });
});

module.exports = router;
