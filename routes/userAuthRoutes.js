const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Course = require("../models/Course");
const TestResult = require("../models/TestResult");
const {
  verifyAdminToken,
  verifyUserToken,
} = require("../middleware/authMiddleware");
const {
  authLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} = require("../middleware/rateLimiter");
const {
  signupValidation,
  loginValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  validObjectId,
  paginationValidation,
} = require("../middleware/validators");

const router = express.Router();

const FALLBACK_DUMMY_HASH =
  "$2a$12$Cj6UzMDM.H6dfI/f/IKcFei6dn9BpqyF3u6SX0plfDx2bUp7sXcXK";

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

// FIXED: Use TLS (port 587) instead of SSL (port 465) for Render compatibility
const createTransporter = () =>
  nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // TLS, not SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

router.get(
  "/admin/all",
  verifyAdminToken,
  paginationValidation,
  async (req, res) => {
    try {
      const { page, limit, skip } = getPagination(req);
      const [users, total] = await Promise.all([
        User.find()
          .populate("courseId", "name")
          .select("-password -resetPasswordToken -resetPasswordExpires")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        User.countDocuments(),
      ]);

      res.json({
        data: users,
        users,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  },
);

router.get("/me", verifyUserToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate("courseId", "name")
      .select("-password -resetPasswordToken -resetPasswordExpires");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    console.error("Fetch profile error:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

router.delete(
  "/:id",
  verifyAdminToken,
  validObjectId("id"),
  async (req, res) => {
    try {
      const user = await User.findByIdAndDelete(req.params.id);

      if (!user) return res.status(404).json({ message: "User not found" });

      await TestResult.deleteMany({ userId: req.params.id });

      res.json({ message: "User and related results deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  },
);

router.post("/signup", authLimiter, signupValidation, async (req, res) => {
  try {
    const { fullName, email, password, courseId, level } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(400).json({ message: "Invalid course selected" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      fullName: fullName.trim(),
      email,
      password: hashedPassword,
      courseId,
      level: Number(level),
    });

    const token = jwt.sign(
      { userId: user._id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      message: "Signup successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        course: { _id: course._id, name: course.name },
        level: user.level,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Signup failed" });
  }
});

router.post("/login", authLimiter, loginValidation, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).populate("courseId", "name");
    if (!user) {
      await bcrypt.compare(
        password,
        process.env.DUMMY_HASH || FALLBACK_DUMMY_HASH,
      );
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user._id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        course: user.courseId,
        level: user.level,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  forgotPasswordValidation,
  async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      if (!user) {
        return res.json({
          message: "If that email exists, a reset link has been sent.",
        });
      }

      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
      await user.save();

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

      try {
        await createTransporter().sendMail({
          from: `"Exam Practice" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: "Password Reset Request",
          text: `Hi ${user.fullName},\n\nUse this link to reset your password. It expires in 1 hour:\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
          html: `
          <div style = "font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2  style = "color: #0f172a;">Reset your password</h2>
          <p   style = "color: #475569;">Hi ${escapeHtml(user.fullName)},           </p>
          <p   style = "color: #475569;">You requested a password reset. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a   href  = "${resetUrl}" style                                         = "display:inline-block;margin:20px 0;padding:12px 24px;background:#185FA5;color:white;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
          <p   style = "color:#94a3b8;font-size:13px;">If you did not request this, you can safely ignore this email.</p>
          </div>
        `,
        });
        console.log(`✅ Reset email sent to ${user.email}`);
      } catch (mailError) {
        console.error("Reset email failed:", mailError);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
        return res
          .status(500)
          .json({ message: "Failed to send reset email. Please try again." });
      }

      res.json({
        message: "If that email exists, a reset link has been sent.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res
        .status(500)
        .json({ message: "Something went wrong. Please try again." });
    }
  },
);

router.post(
  "/reset-password/:token",
  resetPasswordLimiter,
  resetPasswordValidation,
  async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({
          message:
            "Reset link is invalid or has expired. Please request a new one.",
        });
      }

      user.password = await bcrypt.hash(password, 12);
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      res.json({ message: "Password reset successfully. You can now log in." });
    } catch (error) {
      console.error("Reset password error:", error);
      ress
        .status(500)
        .json({ message: "Something went wrong. Please try again." });
    }
  },
);

module.exports = router;
