const rateLimit = require("express-rate-limit");

// Helper function to safely generate IP-based keys with IPv6 support
function ipKeyGenerator(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return req.ip;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
  keyGenerator: ipKeyGenerator,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many password reset requests. Try again in an hour.",
  },
  keyGenerator: ipKeyGenerator,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reset attempts. Try again later." },
  keyGenerator: ipKeyGenerator,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
  keyGenerator: ipKeyGenerator,
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin requests. Please slow down." },
  keyGenerator: ipKeyGenerator,
});

const subjectRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many subject requests. Try again later." },
  keyGenerator: ipKeyGenerator,
});

module.exports = {
  authLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  apiLimiter,
  adminLimiter,
  subjectRequestLimiter,
};
