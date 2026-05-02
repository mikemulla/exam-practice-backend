const express = require("express");
const mongoose = require("mongoose");
const TestResult = require("../models/TestResult");
const Subject = require("../models/Subject");
const Topic = require("../models/Topic");
const User = require("../models/User");
const { verifyUserToken } = require("../middleware/authMiddleware");
const { resultValidation, paginationValidation } = require("../middleware/validators");

const router = express.Router();

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function calculateStreakFromDateStrings(dateStrings) {
  const dateSet = new Set(dateStrings);
  const cursor = new Date();
  const todayKey = cursor.toISOString().slice(0, 10);

  if (!dateSet.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!dateSet.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

router.post("/", verifyUserToken, resultValidation, async (req, res) => {
  try {
    const { subjectId, topicId, score, total, timeTaken, mode } = req.body;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const subject = await Subject.findOne({
      _id: subjectId,
      courseId: user.courseId,
      level: user.level,
    });

    if (!subject) {
      return res.status(403).json({ message: "You are not allowed to save a result for this subject" });
    }

    if (topicId) {
      const topic = await Topic.findOne({ _id: topicId, subjectId });
      if (!topic) {
        return res.status(400).json({ message: "Topic does not belong to selected subject" });
      }
    }

    const result = await TestResult.create({
      userId: req.userId,
      subjectId,
      topicId: topicId || null,
      score: Number(score),
      total: Number(total),
      timeTaken: Number(timeTaken),
      mode: mode || (topicId ? "topic" : "subject"),
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Error saving result:", error);
    res.status(500).json({ message: "Failed to save result" });
  }
});

router.get("/me", verifyUserToken, paginationValidation, async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);

    const [results, total] = await Promise.all([
      TestResult.find({ userId: req.userId })
        .populate("subjectId", "name")
        .populate("topicId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      TestResult.countDocuments({ userId: req.userId }),
    ]);

    res.json({ data: results, results, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Error fetching results:", error);
    res.status(500).json({ message: "Failed to fetch results" });
  }
});

router.get("/me/summary", verifyUserToken, async (req, res) => {
  try {
    const userObjectId = new mongoose.Types.ObjectId(req.userId);

    const [totalsRows, bestRows, dayRows, bySubjectRows] = await Promise.all([
      TestResult.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: null,
            totalTests: { $sum: 1 },
            totalQuestions: { $sum: "$total" },
            totalCorrect: { $sum: "$score" },
          },
        },
      ]),
      TestResult.aggregate([
        { $match: { userId: userObjectId } },
        {
          $project: {
            percent: {
              $cond: [{ $gt: ["$total", 0] }, { $multiply: [{ $divide: ["$score", "$total"] }, 100] }, 0],
            },
          },
        },
        { $group: { _id: null, best: { $max: "$percent" } } },
      ]),
      TestResult.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          },
        },
        { $sort: { _id: -1 } },
      ]),
      TestResult.aggregate([
        { $match: { userId: userObjectId } },
        {
          $group: {
            _id: "$subjectId",
            attempts: { $sum: 1 },
            correct: { $sum: "$score" },
            total: { $sum: "$total" },
          },
        },
        {
          $lookup: {
            from: "subjects",
            localField: "_id",
            foreignField: "_id",
            as: "subject",
          },
        },
        { $unwind: { path: "$subject", preserveNullAndEmptyArrays: true } },
      ]),
    ]);

    const totals = totalsRows[0] || { totalTests: 0, totalQuestions: 0, totalCorrect: 0 };
    const avgScore = totals.totalQuestions > 0 ? Math.round((totals.totalCorrect / totals.totalQuestions) * 100) : 0;
    const best = bestRows[0]?.best ? Math.round(bestRows[0].best) : 0;
    const streak = calculateStreakFromDateStrings(dayRows.map((row) => row._id));

    const bySubject = {};
    bySubjectRows.forEach((row) => {
      const key = row._id ? row._id.toString() : "deleted-subject";
      bySubject[key] = {
        name: row.subject?.name || "Deleted subject",
        attempts: row.attempts,
        correct: row.correct,
        total: row.total,
      };
    });

    res.json({
      totalTests: totals.totalTests,
      totalQuestions: totals.totalQuestions,
      totalCorrect: totals.totalCorrect,
      avgScore,
      best,
      streak,
      bySubject,
    });
  } catch (error) {
    console.error("Error computing summary:", error);
    res.status(500).json({ message: "Failed to compute summary" });
  }
});

module.exports = router;
