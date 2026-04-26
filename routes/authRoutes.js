const express = require("express");

const jwt = require("jsonwebtoken");

const router = express.Router();

router.post("/admin-login", (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: "Password is required" });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid admin password" });
  }

  const token = jwt.sign(
    { role: "admin" },

    process.env.JWT_SECRET,

    { expiresIn: "8h" },
  );

  res.json({
    message: "Login successful",

    token,
  });
});

module.exports = router;
