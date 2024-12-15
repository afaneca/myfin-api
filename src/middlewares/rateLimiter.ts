import rateLimit from "express-rate-limit";

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100, // Max: 100 requests per minute
  message: "You have exceeded your 100 requests per minute limit.",
  headers: true,
});