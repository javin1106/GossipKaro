import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const requestIp = (req) =>
  req.ip || req.socket?.remoteAddress || "unknown-client";

export const ipRateLimitKey = (req) => requestIp(req);

export const emailRateLimitKey = (req) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "missing-email";

  return `${requestIp(req)}:${email}`;
};

export const userRateLimitKey = (req) =>
  req.user?._id?.toString() || requestIp(req);

export const createRateLimitMiddleware = ({
  scope,
  limit,
  windowSeconds,
  message = "Too many requests. Please try again later",
  keyGenerator = ipRateLimitKey,
}) =>
  asyncHandler(async (req, res, next) => {
    const rateLimiter = req.app.get("rateLimiter");
    if (!rateLimiter) {
      throw new ApiError(503, "Rate limiting service is unavailable");
    }

    const result = await rateLimiter.consume({
      scope,
      identifier: keyGenerator(req),
      limit,
      windowSeconds,
    });

    res.setHeader("RateLimit-Limit", result.limit);
    res.setHeader("RateLimit-Remaining", result.remaining);
    res.setHeader("RateLimit-Reset", result.retryAfterSeconds);

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfterSeconds);
      throw new ApiError(429, message);
    }

    next();
  });
