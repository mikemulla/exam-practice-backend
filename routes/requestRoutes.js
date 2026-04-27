const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const SubjectRequest = require("../models/SubjectRequest");
const verifyAdminToken = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const fileMeta = (file) => ({
  fileName: file?.originalname ?? "",
  fileSize: file?.size ?? 0,
  fileType: file?.mimetype ?? "",
});

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

// GET all requests (admin)
router.get("/", verifyAdminToken, async (req, res) => {
  try {
    const requests = await SubjectRequest.find().sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST new subject request
router.post("/subject-request", upload.single("file"), async (req, res) => {
  try {
    const { subject, topic, timer } = req.body;

    if (!subject || !topic || !timer) {
      return res
        .status(400)
        .json({ message: "Subject, topic, and timer are required" });
    }

    const savedRequest = await SubjectRequest.create({
      subject,
      topic,
      timer: Number(timer),
      ...fileMeta(req.file),
    });

    // Send email separately — don't let it crash the whole request
    try {
      await createTransporter().sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.REQUEST_RECEIVER_EMAIL,
        subject: `New Subject Request: ${subject}`,
        html: `
          <h2>New Subject Request</h2>
          <p><strong>Subject: </strong> ${subject}</p>
          <p><strong>Topic  : </strong> ${topic}</p>
          <p><strong>Timer  : </strong> ${timer} minutes</p>
          <p><strong>Status : </strong> Saved to admin inbox</p>
        `,
        attachments: req.file
          ? [{ filename: req.file.originalname, content: req.file.buffer }]
          : [],
      });
    } catch (mailErr) {
      console.error("Email failed (request still saved):", mailErr);
    }

    return res.status(201).json({
      message: "Request sent and saved successfully",
      request: savedRequest,
    });
  } catch (err) {
    console.error("Subject request error:", err);
    return res.status(500).json({ message: "Failed to send request" });
  }
});

// PUT mark as reviewed (admin)
router.put("/:id/reviewed", verifyAdminToken, async (req, res) => {
  try {
    const request = await SubjectRequest.findByIdAndUpdate(
      req.params.id,
      { status: "reviewed" },
      { returnDocument: "after" },
    );
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE request (admin)
router.delete("/:id", verifyAdminToken, async (req, res) => {
  try {
    const request = await SubjectRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json({ message: "Request deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(400)
      .json({ message: "File is too large. Maximum file size is 5MB." });
  }
  return res.status(500).json({ message: "File upload failed." });
});

module.exports = router;
