import crypto from "node:crypto";

const RATE_LIMIT_KEY_PREFIX = "gossipkaro:rate-limit:";
const MAX_MEMORY_ENTRIES = 10000;

const hashKey = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const getRetryAfterSeconds = (now, windowMs) =>
  Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000));

export function createRateLimiter(redisClient, options = {}) {
  const memoryStore = new Map();
  const now = options.now || Date.now;
  let redisWarningLogged = false;

  const consumeFromMemory = ({ storageKey, windowMs, currentTime }) => {
    const existing = memoryStore.get(storageKey);
    const count = (existing?.count || 0) + 1;

    memoryStore.set(storageKey, {
      count,
      expiresAt: currentTime + windowMs,
    });

    if (memoryStore.size > MAX_MEMORY_ENTRIES) {
      for (const [key, value] of memoryStore) {
        if (value.expiresAt <= currentTime) memoryStore.delete(key);
      }
    }

    return count;
  };

  const consume = async ({
    scope,
    identifier,
    limit,
    windowSeconds,
  }) => {
    if (!scope || !identifier || !Number.isInteger(limit) || limit < 1) {
      throw new Error("Rate limiter configuration is invalid");
    }

    if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
      throw new Error("Rate limiter window must be at least one second");
    }

    const currentTime = now();
    const windowMs = windowSeconds * 1000;
    const windowId = Math.floor(currentTime / windowMs);
    const keyHash = hashKey(`${scope}:${identifier}`);
    const storageKey = `${RATE_LIMIT_KEY_PREFIX}${keyHash}:${windowId}`;
    let count;

    if (redisClient) {
      try {
        count = await redisClient.incr(storageKey);
        if (count === 1) {
          await redisClient.expire(storageKey, windowSeconds + 1);
        }
      } catch (error) {
        if (!redisWarningLogged) {
          console.warn(
            `Redis rate limiting unavailable (${error.message}). Using in-memory limits.`,
          );
          redisWarningLogged = true;
        }
      }
    }

    if (!Number.isInteger(count)) {
      count = consumeFromMemory({
        storageKey,
        windowMs,
        currentTime,
      });
    }

    const retryAfterSeconds = getRetryAfterSeconds(currentTime, windowMs);

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  };

  return {
    consume,
    isRedisBacked: Boolean(redisClient),
  };
}
