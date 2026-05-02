const { body, param, query, validationResult } = require("express-validator");
const mongoose = require("mongoose");

const LEVELS = [100, 200, 300, 400, 500, 600];
const MAX_TIME_TAKEN_SECONDS = 86400;

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  next();
}

function validObjectId(field) {
  return [
    param(field).custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error("Invalid ID format");
      }
      return true;
    }),
    validate,
  ];
}

const paginationValidation = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100"),
  validate,
];

function getQuestionIndex(path) {
  const bracketMatch = String(path).match(/questions\[(\d+)\]/);
  if (bracketMatch) return Number(bracketMatch[1]);

  const dotMatch = String(path).match(/questions\.(\d+)\./);
  if (dotMatch) return Number(dotMatch[1]);

  return null;
}

function validMongoIdBody(field, message) {
  return body(field)
    .notEmpty()
    .withMessage(message || `${field} is required`)
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error("Invalid ID format");
      }
      return true;
    });
}

const signupValidation = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 100 })
    .withMessage("Name too long"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .isLength({ max: 128 })
    .withMessage("Password too long"),
  validMongoIdBody("courseId", "Course is required"),
  body("level").toInt().isIn(LEVELS).withMessage("Invalid level"),
  validate,
];

const loginValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ max: 128 })
    .withMessage("Password too long"),
  validate,
];

const forgotPasswordValidation = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  validate,
];

const resetPasswordValidation = [
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .isLength({ max: 128 })
    .withMessage("Password too long"),
  validate,
];

const subjectValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Subject name is required")
    .isLength({ max: 200 })
    .withMessage("Subject name too long"),
  validMongoIdBody("courseId", "Course is required"),
  body("level").toInt().isIn(LEVELS).withMessage("Invalid level"),
  body("duration")
    .optional()
    .toInt()
    .isInt({ min: 60, max: 7200 })
    .withMessage("Duration must be between 60 and 7200 seconds"),
  validate,
];

const topicValidation = [
  validMongoIdBody("subjectId", "Subject is required"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Topic name is required")
    .isLength({ max: 200 })
    .withMessage("Topic name too long"),
  validate,
];

const questionValidation = [
  validMongoIdBody("subjectId", "Subject is required"),
  validMongoIdBody("topicId", "Topic is required"),
  body("questionText")
    .trim()
    .notEmpty()
    .withMessage("Question text is required")
    .isLength({ max: 2000 })
    .withMessage("Question too long"),
  body("options")
    .isArray({ min: 2, max: 6 })
    .withMessage("Provide between 2 and 6 options")
    .custom((options) => {
      if (options.some((option) => typeof option !== "string" || option.trim() === "")) {
        throw new Error("All options must be non-empty strings");
      }
      return true;
    }),
  body("correctAnswer")
    .trim()
    .notEmpty()
    .withMessage("Correct answer is required")
    .custom((answer, { req }) => {
      const cleanedOptions = (req.body.options || []).map((option) => String(option).trim());
      if (!cleanedOptions.includes(String(answer).trim())) {
        throw new Error("Correct answer must match one of the options");
      }
      return true;
    }),
  body("explanation")
    .trim()
    .notEmpty()
    .withMessage("Explanation is required")
    .isLength({ max: 3000 })
    .withMessage("Explanation too long"),
  validate,
];

const bulkQuestionValidation = [
  validMongoIdBody("subjectId", "Subject is required"),
  body("questions").isArray({ min: 1, max: 200 }).withMessage("questions must be an array of 1 to 200 items"),
  body("questions.*.topicId")
    .notEmpty()
    .withMessage("Each question must have a topicId")
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) throw new Error("Invalid topicId in question");
      return true;
    }),
  body("questions.*.questionText")
    .trim()
    .notEmpty()
    .withMessage("Each question must have questionText")
    .isLength({ max: 2000 })
    .withMessage("Each questionText must be 2000 characters or less"),
  body("questions.*.options")
    .isArray({ min: 2, max: 6 })
    .withMessage("Each question needs 2 to 6 options")
    .custom((options) => {
      if (options.some((option) => typeof option !== "string" || option.trim() === "")) {
        throw new Error("Each option must be a non-empty string");
      }
      return true;
    }),
  body("questions.*.correctAnswer")
    .trim()
    .notEmpty()
    .withMessage("Each question must have a correctAnswer")
    .custom((answer, meta) => {
      const index = getQuestionIndex(meta.path);
      const question = index === null ? null : meta.req.body.questions[index];
      const options = (question?.options || []).map((option) => String(option).trim());
      if (!options.includes(String(answer).trim())) {
        throw new Error("Each correctAnswer must match one of that question's options");
      }
      return true;
    }),
  body("questions.*.explanation")
    .trim()
    .notEmpty()
    .withMessage("Each question must have an explanation")
    .isLength({ max: 3000 })
    .withMessage("Each explanation must be 3000 characters or less"),
  validate,
];

const subjectRequestValidation = [
  body("subject")
    .trim()
    .notEmpty()
    .withMessage("Subject name is required")
    .isLength({ max: 200 })
    .withMessage("Subject name too long"),
  body("topic")
    .trim()
    .notEmpty()
    .withMessage("Topic is required")
    .isLength({ max: 200 })
    .withMessage("Topic too long"),
  body("timer").toInt().isInt({ min: 1, max: 300 }).withMessage("Timer must be between 1 and 300 minutes"),
  validate,
];

const resultValidation = [
  validMongoIdBody("subjectId", "Subject is required"),
  body("topicId")
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) throw new Error("Invalid topic ID");
      return true;
    }),
  body("score").toInt().isInt({ min: 0 }).withMessage("Score must be a non-negative integer"),
  body("total")
    .toInt()
    .isInt({ min: 1 })
    .withMessage("Total must be at least 1")
    .custom((total, { req }) => {
      if (Number(req.body.score) > Number(total)) {
        throw new Error("Score cannot exceed total");
      }
      return true;
    }),
  body("timeTaken")
    .toInt()
    .isInt({ min: 0, max: MAX_TIME_TAKEN_SECONDS })
    .withMessage("timeTaken must be between 0 and 86400 seconds"),
  body("mode").optional().isIn(["subject", "topic"]).withMessage("mode must be 'subject' or 'topic'"),
  validate,
];

module.exports = {
  LEVELS,
  MAX_TIME_TAKEN_SECONDS,
  validate,
  validObjectId,
  paginationValidation,
  signupValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  subjectValidation,
  topicValidation,
  questionValidation,
  bulkQuestionValidation,
  subjectRequestValidation,
  resultValidation,
};
