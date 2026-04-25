const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/subject-request", upload.single("file"), async (req, res) => {
  try {
    const { subject, topic, timer } = req.body;

    if (!subject || !topic || !timer) {
      return res.status(400).json({
        message: "Subject, topic, and timer are required",
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.REQUEST_RECEIVER_EMAIL,
      subject: `New Subject Request: ${subject}`,
      html: `
        <h2>New Subject Request</h2>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Topic:</strong> ${topic}</p>
        <p><strong>Timer:</strong> ${timer} minutes</p>
        <p>A file was uploaded with this request.</p>
      `,
      attachments: req.file
        ? [
            {
              filename: req.file.originalname,
              content: req.file.buffer,
            },
          ]
        : [],
    };

    await transporter.sendMail(mailOptions);

    res.json({ message: "Request sent successfully" });
  } catch (error) {
    console.error("Email request error:", error);
    res.status(500).json({ message: "Failed to send request" });
  }
});

module.exports = router;
