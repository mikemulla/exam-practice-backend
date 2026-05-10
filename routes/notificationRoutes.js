const express = require("express");
const mongoose = require("mongoose");

const Course = require("../models/Course");
const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const User = require("../models/User");
const Question = require("../models/Question");

const { verifyAdminToken } = require("../middleware/authMiddleware");
const { sendEmail } = require("../utils/emailClient");

const router = express.Router();

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map((id) => String(id).trim()).filter(Boolean))];
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getNotificationData({ courseId, level, subjectIds, topicIds }) {
  if (!isValidObjectId(courseId)) {
    return { error: { status: 400, message: "Invalid course ID" } };
  }

  const numericLevel = Number(level);
  if (![100, 200, 300, 400, 500, 600].includes(numericLevel)) {
    return { error: { status: 400, message: "Invalid level" } };
  }

  const cleanSubjectIds = normalizeIdArray(subjectIds);
  const cleanTopicIds = normalizeIdArray(topicIds);

  const invalidSubjectId = cleanSubjectIds.find((id) => !isValidObjectId(id));
  const invalidTopicId = cleanTopicIds.find((id) => !isValidObjectId(id));

  if (invalidSubjectId) {
    return { error: { status: 400, message: "Invalid subject ID selected" } };
  }

  if (invalidTopicId) {
    return { error: { status: 400, message: "Invalid topic ID selected" } };
  }

  if (cleanSubjectIds.length === 0 && cleanTopicIds.length === 0) {
    return {
      error: {
        status: 400,
        message: "Select at least one subject or one topic",
      },
    };
  }

  const course = await Course.findById(courseId).lean();
  if (!course) {
    return { error: { status: 404, message: "Course not found" } };
  }

  const subjectQuery = {
    courseId,
    level: numericLevel,
  };

  if (cleanSubjectIds.length > 0) {
    subjectQuery._id = { $in: cleanSubjectIds };
  }

  let subjects = await Subject.find(subjectQuery).sort({ name: 1 }).lean();

  if (
    cleanSubjectIds.length > 0 &&
    subjects.length !== cleanSubjectIds.length
  ) {
    return {
      error: {
        status: 400,
        message:
          "One or more selected subjects do not match this course and level",
      },
    };
  }

  let topics = [];

  if (cleanTopicIds.length > 0) {
    topics = await Topic.find({ _id: { $in: cleanTopicIds } })
      .populate("subjectId", "name courseId level")
      .sort({ name: 1 })
      .lean();

    if (topics.length !== cleanTopicIds.length) {
      return {
        error: {
          status: 400,
          message: "One or more selected topics could not be found",
        },
      };
    }

    const invalidTopic = topics.find((topic) => {
      const subject = topic.subjectId;
      return (
        !subject ||
        subject.courseId.toString() !== courseId.toString() ||
        Number(subject.level) !== numericLevel
      );
    });

    if (invalidTopic) {
      return {
        error: {
          status: 400,
          message:
            "One or more selected topics do not match this course and level",
        },
      };
    }

    const topicSubjectIds = [
      ...new Set(topics.map((topic) => topic.subjectId._id.toString())),
    ];

    const existingSubjectIds = new Set(
      subjects.map((subject) => subject._id.toString()),
    );

    const missingTopicSubjectIds = topicSubjectIds.filter(
      (id) => !existingSubjectIds.has(id),
    );

    if (missingTopicSubjectIds.length > 0) {
      const topicSubjects = await Subject.find({
        _id: { $in: missingTopicSubjectIds },
        courseId,
        level: numericLevel,
      })
        .sort({ name: 1 })
        .lean();

      subjects = [...subjects, ...topicSubjects];
    }
  } else if (subjects.length > 0) {
    topics = await Topic.find({
      subjectId: { $in: subjects.map((subject) => subject._id) },
    })
      .populate("subjectId", "name courseId level")
      .sort({ name: 1 })
      .lean();
  }

  const users = await User.find({
    courseId,
    level: numericLevel,
  })
    .select("fullName email")
    .sort({ fullName: 1 })
    .lean();

  return {
    course,
    level: numericLevel,
    subjects,
    topics,
    users,
    cleanSubjectIds,
    cleanTopicIds,
  };
}

function buildEmailContent({
  course,
  level,
  subjects,
  topics,
  customMessage,
  frontendUrl,
}) {
  const loginUrl = `${frontendUrl.replace(/\/$/, "")}/user-login`;

  const topicLines =
    topics.length > 0
      ? topics
          .map((topic) => {
            const subjectName = topic.subjectId?.name || "Selected subject";
            return `<li style="margin-bottom:8px;"><strong style="color:#185FA5;">${escapeHtml(subjectName)}:</strong> ${escapeHtml(
              topic.name,
            )}</li>`;
          })
          .join("")
      : "";

  const subjectLines = subjects
    .map(
      (subject) =>
        `<li style="margin-bottom:8px;color:#0f172a;">${escapeHtml(subject.name)}</li>`,
    )
    .join("");

  const selectedContent =
    topics.length > 0
      ? `<p style="margin:24px 0 12px;font-weight:700;color:#0f172a;font-size:16px;">📚 Available Topics:</p><ul style="list-style:none;padding:0;margin:0;">${topicLines}</ul>`
      : `<p style="margin:24px 0 12px;font-weight:700;color:#0f172a;font-size:16px;">📖 Available Subjects:</p><ul style="list-style:none;padding:0;margin:0;">${subjectLines}</ul>`;

  const customMessageHtml = customMessage
    ? `<div style="margin:20px 0;padding:16px;border-left:4px solid #185FA5;background:#E6F1FB;border-radius:6px;"><p style="margin:0;color:#0e3d6e;font-weight:500;">${escapeHtml(
        customMessage,
      )}</p></div>`
    : "";

  const subject = `🎯 New Questions Available: ${course.name} ${level} Level`;

  const html = `
    <div style = "font-family:'Segoe UI',Arial,sans-serif;line-height:1.8;color:#0f172a;max-width:600px;margin:0 auto;">
      <!-- Header -->
      <div style = "background:linear-gradient(135deg, #185FA5 0%, #0e3d6e 100%);padding:32px 24px;border-radius:12px 12px 0 0;text-align:center;">
      <h1  style = "margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">✨ New Practice Questions Available</h1>
      </div>

      <!-- Main Content -->
      <div style = "background:#ffffff;padding:32px 24px;border:1px solid #e2e8f0;border-top:none;">
        <!-- Intro -->
        <p style = "margin:0 0 24px;font-size:16px;color:#475569;line-height:1.8;">
          Great news! 🎉 New questions have been added for your course. It's time to level up your exam prep!
        </p>

        <!-- Course Info Card -->
        <div style = "background:#f8fafc;border-left:4px solid #185FA5;padding:16px;border-radius:6px;margin-bottom:24px;">
        <p   style = "margin:0 0 8px;font-weight:600;color:#0f172a;">Course Information:</p>
        <p   style = "margin:4px 0;color:#475569;"><strong>Course:</strong> ${escapeHtml(course.name)}</p>
        <p   style = "margin:4px 0;color:#475569;"><strong>Level:</strong> ${level} Level</p>
        </div>

        <!-- Selected Content -->
        ${selectedContent}

        <!-- Custom Message (if provided) -->
        ${customMessageHtml}

        <!-- CTA Button -->
        <div style = "margin:32px 0;text-align:center;">
        <a   href  = "${loginUrl}" style = "background:linear-gradient(135deg, #185FA5 0%, #0e3d6e 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;display:inline-block;font-weight:700;font-size:16px;box-shadow:0 4px 12px rgba(24, 95, 165, 0.3);transition:all 0.3s ease;">
            🚀 Start Practicing Now
          </a>
        </div>

        <!-- Info Section -->
        <div style = "margin-top:32px;padding-top:24px;border-top:1px solid #e2e8f0;">
        <p   style = "margin:0;font-size:13px;color:#64748b;line-height:1.8;">
            Ready to ace your exams? Login to your account and start working through these new questions. Each question comes with detailed explanations to help you master the material.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div style = "background:#f1f5f9;padding:20px 24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;text-align:center;">
      <p   style = "margin:0;font-size:12px;color:#64748b;">
          You received this email because your account is registered for <strong>${escapeHtml(course.name)}</strong>, <strong>${level} Level</strong>.
        </p>
        <p style = "margin:12px 0 0;font-size:11px;color:#94a3b8;">
          © ${new Date().getFullYear()} Exam Practice Platform. All rights reserved.
        </p>
      </div>
    </div>
  `;

  const textLines = [
    "✨ NEW PRACTICE QUESTIONS AVAILABLE",
    "=".repeat(40),
    "",
    `Course: ${course.name}`,
    `Level: ${level}`,
    "",
    topics.length > 0 ? "📚 TOPICS:" : "📖 SUBJECTS:",
    ...(topics.length > 0
      ? topics.map(
          (topic) =>
            `  • ${topic.subjectId?.name || "Selected subject"}: ${topic.name}`,
        )
      : subjects.map((item) => `  • ${item.name}`)),
    "",
    ...(customMessage ? [`MESSAGE: ${customMessage}`, ""] : []),
    `Log in and start practicing: ${loginUrl}`,
    "",
    `Ready to ace your exams? Login now and work through these new questions with detailed explanations!`,
    "",
    "=".repeat(40),
    `© ${new Date().getFullYear()} Exam Practice Platform`,
  ].filter(Boolean);

  return {
    subject,
    html,
    text: textLines.join("\n"),
  };
}

router.post(
  "/questions-available/preview",
  verifyAdminToken,
  async (req, res) => {
    try {
      const { courseId, level } = req.body;

      if (!isValidObjectId(courseId)) {
        return res.status(400).json({ message: "Invalid course ID" });
      }

      const numericLevel = Number(level);

      if (![100, 200, 300, 400, 500, 600].includes(numericLevel)) {
        return res.status(400).json({ message: "Invalid level" });
      }

      const users = await User.find({
        courseId,
        level: numericLevel,
      })
        .select("_id")
        .lean();

      res.json({
        recipientCount: users.length,
      });
    } catch (error) {
      console.error("Preview notification recipients error:", error);
      res.status(500).json({ message: "Failed to preview recipients" });
    }
  },
);

router.post("/questions-available", verifyAdminToken, async (req, res) => {
  try {
    const {
      courseId,
      level,
      subjectIds = [],
      topicIds = [],
      customMessage = "",
    } = req.body;

    const data = await getNotificationData({
      courseId,
      level,
      subjectIds,
      topicIds,
    });

    if (data.error) {
      return res
        .status(data.error.status)
        .json({ message: data.error.message });
    }

    const { course, users, subjects, topics } = data;

    if (users.length === 0) {
      return res.status(400).json({
        message: "No users found for this course and level",
        recipientCount: 0,
        sentCount: 0,
      });
    }

    const selectedSubjectIds = subjects.map((subject) => subject._id);
    const selectedTopicIds = topics.map((topic) => topic._id);

    const questionCount = await Question.countDocuments({
      subjectId: { $in: selectedSubjectIds },
      ...(selectedTopicIds.length > 0
        ? { topicId: { $in: selectedTopicIds } }
        : {}),
    });

    if (questionCount === 0) {
      return res.status(400).json({
        message:
          "No questions found for the selected subjects/topics. Add questions before notifying users.",
      });
    }

    const frontendUrl =
      process.env.FRONTEND_URL ||
      process.env.ALLOWED_ORIGINS?.split(",")?.[0]?.trim() ||
      "http://localhost:5173";

    const emailContent = buildEmailContent({
      course,
      level: data.level,
      subjects,
      topics,
      customMessage: String(customMessage || "").trim(),
      frontendUrl,
    });

    let sentCount = 0;
    const failed = [];

    for (const user of users) {
      try {
        await sendEmail({
          to: user.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });

        sentCount += 1;
      } catch (error) {
        console.error("Notification email failed:", user.email, error);
        failed.push(user.email);
      }
    }

    res.json({
      message: `Notification sent to ${sentCount} of ${users.length} user(s).`,
      recipientCount: users.length,
      sentCount,
      failedCount: failed.length,
      failed,
    });
  } catch (error) {
    console.error("Send questions available notification error:", error);
    res.status(500).json({ message: "Failed to send notification" });
  }
});

module.exports = router;
