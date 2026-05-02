const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
  keyGenerator: (req, res) => {
    // Use X-Forwarded-For if available (for proxy), otherwise use ip
    return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many password reset requests. Try again in an hour.",
  },
  keyGenerator: (req, res) => {
    return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reset attempts. Try again later." },
  keyGenerator: (req, res) => {
    return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
  keyGenerator: (req, res) => {
    return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin requests. Please slow down." },
  keyGenerator: (req, res) => {
    return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  },
});

const subjectRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many subject requests. Try again later." },
  keyGenerator: (req, res) => {
    return req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;
  },
});

module.exports = {
  authLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  apiLimiter,
  adminLimiter,
  subjectRequestLimiter,
};
