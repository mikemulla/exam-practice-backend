const express = require("express");
const router = express.Router();
const Subject = require("../models/Subject");
const Question = require("../models/Question");

// Add subject
router.post("/", async (req, res) => {
  try {
    const subject = new Subject({
      name: req.body.name,
      duration: req.body.duration || 300,
    });

    await subject.save();
    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all subjects
router.get("/", async (req, res) => {
  try {
    const subjects = await Subject.find();
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get one subject by ID
router.get("/:id", async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update subject
router.put("/:id", async (req, res) => {
  try {
    const updatedSubject = await Subject.findByIdAndUpdate(
      req.params.id,
      {
        name: req.body.name,
        duration: req.body.duration,
      },
      { new: true, runValidators: true },
    );

    res.json(updatedSubject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete subject
router.delete("/:id", async (req, res) => {
  try {
    const subjectId = req.params.id;

    const deletedSubject = await Subject.findByIdAndDelete(subjectId);

    if (!deletedSubject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    await Question.deleteMany({ subjectId });

    res.json({
      message: "Subject and related questions deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
