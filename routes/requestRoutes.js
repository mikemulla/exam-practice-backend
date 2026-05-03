const express = require("express");
const multer = require("multer");
const { Resend } = require("resend");
const SubjectRequest = require("../models/SubjectRequest");
const {
  verifyAdminToken,
  verifyUserToken,
} = require("../middleware/authMiddleware");
const { subjectRequestLimiter } = require("../middleware/rateLimiter");
const {
  subjectRequestValidation,
  validObjectId,
  paginationValidation,
} = require("../middleware/validators");

const router = express.Router();

const resend = new Resend(process.env.RESEND_API_KEY);

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

function getPagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isMagicBytesAllowed(file) {
  if (!file) return true;

  const buffer = file.buffer;
  if (!buffer || buffer.length < 4) return file.mimetype === "text/plain";

  const first4 = buffer.subarray(0, 4).toString("hex").toLowerCase();
  const first5Text = buffer.subarray(0, 5).toString("utf8");

  if (file.mimetype === "application/pdf") return first5Text === "%PDF-";
  if (file.mimetype === "image/png") return first4 === "89504e47";
  if (file.mimetype === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return first4 === "504b0304";
  }
  if (file.mimetype === "application/msword") return first4 === "d0cf11e0";
  if (file.mimetype === "text/plain") return true;

  return false;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type"), false);
    }
  },
});

const fileMeta = (file) => ({
  fileName: file?.originalname ?? "",
  fileSize: file?.size ?? 0,
  fileType: file?.mimetype ?? "",
});

function getEmailFrom() {
  return process.env.EMAIL_FROM || "Exam Practice <onboarding@resend.dev>";
}

function getRequestReceiverEmail() {
  return process.env.REQUEST_RECEIVER_EMAIL || process.env.EMAIL_USER;
}

async function sendSubjectRequestEmail({ subject, topic, timer, file }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const to = getRequestReceiverEmail();
  if (!to) {
    throw new Error("REQUEST_RECEIVER_EMAIL is not configured");
  }

  return resend.emails.send({
    from: getEmailFrom(),
    to,
    subject: `New Subject Request: ${subject}`,
    text: `New subject request\nSubject: ${subject}\nTopic: ${topic}\nTimer: ${timer} minutes`,
    html: `
      <h2>New Subject Request</h2>
      <p><strong>Subject: </strong> ${escapeHtml(subject)}</p>
      <p><strong>Topic  : </strong> ${escapeHtml(topic)}</p>
      <p><strong>Timer  : </strong> ${escapeHtml(timer)} minutes</p>
      <p><strong>Status : </strong> Saved to admin inbox</p>
    `,
    attachments: file
      ? [
          {
            filename: file.originalname,
            content: file.buffer.toString("base64"),
          },
        ]
      : [],
  });
}

router.get("/", verifyAdminToken, paginationValidation, async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const query = {};

    if (req.query.status) {
      if (!["pending", "reviewed"].includes(req.query.status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      query.status = req.query.status;
    }

    const [requests, total] = await Promise.all([
      SubjectRequest.find(query)
        .populate({
          path: "userId",
          select: "fullName email courseId level",
          populate: {
            path: "courseId",
            select: "name",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SubjectRequest.countDocuments(query),
    ]);

    res.json({
      data: requests,
      requests,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Fetch requests error:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

router.post(
  "/subject-request",
  verifyUserToken,
  subjectRequestLimiter,
  upload.single("file"),
  subjectRequestValidation,
  async (req, res) => {
    try {
      const { subject, topic, timer } = req.body;

      if (!isMagicBytesAllowed(req.file)) {
        return res.status(400).json({
          message:
            "Uploaded file content does not match the selected file type.",
        });
      }

      const savedRequest = await SubjectRequest.create({
        userId: req.userId,
        subject: subject.trim(),
        topic: topic.trim(),
        timer: Number(timer),
        ...fileMeta(req.file),
      });

      res.status(201).json({
        message: "Request sent and saved successfully",
        request: savedRequest,
      });

      sendSubjectRequestEmail({
        subject,
        topic,
        timer,
        file: req.file,
      }).catch((mailError) => {
        console.error(
          "Resend subject request email failed. Request still saved:",
          mailError,
        );
      });
    } catch (error) {
      console.error("Subject request error:", error);
      res.status(500).json({ message: "Failed to send request" });
    }
  },
);

router.put(
  "/:id/reviewed",
  verifyAdminToken,
  validObjectId("id"),
  async (req, res) => {
    try {
      const request = await SubjectRequest.findById(req.params.id).populate({
        path: "userId",
        select: "fullName email",
      });

      if (!request) {
        return res.status(404).json({ message: "Request not found" });
      }

      request.status = "reviewed";
      await request.save();

      res.json({ message: "Request marked as reviewed", request });

      // 🔥 SEND EMAIL AFTER RESPONSE
      if (request.userId?.email) {
        resend.emails
          .send({
            from: getEmailFrom(),
            to: request.userId.email,
            subject: "Your requested subject has been reviewed",
            html: `
            <div style = "font-family: sans-serif; max-width: 500px;">
            <h2  style = "color:#0f172a;">Good news 🎉</h2>
              <p>Hi ${escapeHtml(request.userId.fullName || "there")},</p>
              
              <p>Your request has been reviewed by the admin.</p>

              <p><strong>Subject:</strong> ${escapeHtml(request.subject)}</p>
              <p><strong>Topic:</strong> ${escapeHtml(request.topic)}</p>

              <p>You can now check the platform to see updates.</p>

              <p style="margin-top:20px;color:#64748b;font-size:13px;">
                If you did not request this, you can ignore this message.
              </p>
            </div>
          `,
          })
          .then(() => {
            console.log("Review email sent to user");
          })
          .catch((err) => {
            console.error("Failed to send review email:", err);
          });
      }
    } catch (error) {
      console.error("Review request error:", error);
      res.status(500).json({ message: "Failed to update request" });
    }
  },
);

router.delete(
  "/:id",
  verifyAdminToken,
  validObjectId("id"),
  async (req, res) => {
    try {
      const request = await SubjectRequest.findByIdAndDelete(req.params.id);

      if (!request)
        return res.status(404).json({ message: "Request not found" });

      res.json({ message: "Request deleted successfully" });
    } catch (error) {
      console.error("Delete request error:", error);
      res.status(500).json({ message: "Failed to delete request" });
    }
  },
);

router.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "File too large. Maximum size is 15MB.",
    });
  }

  if (err.message === "Unsupported file type") {
    return res.status(400).json({ message: "Unsupported file type." });
  }

  console.error("File upload error:", err);
  return res.status(500).json({ message: "File upload failed." });
});

module.exports = router;
