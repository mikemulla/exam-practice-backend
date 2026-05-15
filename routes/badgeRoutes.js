const express = require("express");
const Badge = require("../models/Badge");
const { verifyUserToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/me", verifyUserToken, async (req, res) => {
  try {
    const badges = await Badge.find({ userId: req.userId }).sort({
      createdAt: -1,
    });

    res.json({
      badges,
    });
  } catch (error) {
    console.error("Badge fetch error:", error);

    res.status(500).json({
      message: "Failed to fetch badges",
    });
  }
});

module.exports = router;
