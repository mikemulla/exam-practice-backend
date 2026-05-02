const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const getKey = (req) => {
  return ipKeyGenerator(req.ip);
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: {
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    message: "Too many login attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message: "Too many admin login attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
});

const bulkImportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    message: "Too many bulk import requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    message: "Too many write requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
});

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: {
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getKey,
});

module.exports = {
  generalLimiter,
  authLimiter,
  adminLimiter,
  bulkImportLimiter,
  writeLimiter,
  readLimiter,
};
