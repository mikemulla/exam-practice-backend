const express = require("express");
const Course = require("../models/Course");
const Subject = require("../models/Subject");
const User = require("../models/User");
const { verifyAdminToken } = require("../middleware/authMiddleware");
const { validObjectId, paginationValidation } = require("../middleware/validators");

const router = express.Router();

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

router.get("/", paginationValidation, async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const [courses, total] = await Promise.all([
      Course.find().sort({ name: 1 }).skip(skip).limit(limit),
      Course.countDocuments(),
    ]);

    res.json({ data: courses, courses, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Fetch courses error:", error);
    res.status(500).json({ message: "Failed to fetch courses" });
  }
});

router.get("/seed", (_req, res) => {
  res.status(405).json({ message: "Use POST /api/courses/seed with an admin token" });
});

router.post("/seed", verifyAdminToken, async (_req, res) => {
  const defaultCourses = ["Medicine", "Nursing", "Pharmacology", "MLS", "Physiology"];

  try {
    const courses = await Promise.all(
      defaultCourses.map((name) =>
        Course.findOneAndUpdate({ name }, { name }, { upsert: true, returnDocument: "after" }),
      ),
    );

    res.json({ message: "Default courses seeded", courses });
  } catch (error) {
    console.error("Seed courses error:", error);
    res.status(500).json({ message: "Failed to seed courses" });
  }
});

router.post("/", verifyAdminToken, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ message: "Course name is required" });
    }

    const course = await Course.create({ name });
    res.status(201).json(course);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Course already exists" });
    }

    console.error("Create course error:", error);
    res.status(500).json({ message: "Failed to create course" });
  }
});

router.delete("/:id", verifyAdminToken, validObjectId("id"), async (req, res) => {
  try {
    const [subjectExists, userExists] = await Promise.all([
      Subject.exists({ courseId: req.params.id }),
      User.exists({ courseId: req.params.id }),
    ]);

    if (subjectExists || userExists) {
      return res.status(400).json({ message: "Cannot delete course while it is in use" });
    }

    const course = await Course.findByIdAndDelete(req.params.id);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    console.error("Delete course error:", error);
    res.status(500).json({ message: "Failed to delete course" });
  }
});

module.exports = router;
