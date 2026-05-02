const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/admin-login", authLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    if (!process.env.ADMIN_PASSWORD_HASH) {
      return res.status(500).json({ message: "Admin login is not configured" });
    }

    const isValid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);

    if (!isValid) {
      return res.status(401).json({ message: "Invalid admin password" });
    }

    const token = jwt.sign(
      {
        role: "admin",
        adminId: process.env.ADMIN_ID || "primary-admin",
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Admin login failed" });
  }
});

module.exports = router;
