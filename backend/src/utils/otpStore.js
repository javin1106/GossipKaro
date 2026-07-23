import crypto from "crypto";

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 10 * 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

const memoryStore = new Map();

const normalizeEmail = (email = "") => email.trim().toLowerCase();

const normalizePurpose = (purpose = "register") =>
  purpose.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");

const getOtpKey = (purpose, email) =>
  `gossipkaro:otp:${normalizePurpose(purpose)}:${normalizeEmail(email)}`;

const getSecret = () =>
  process.env.OTP_SECRET ||
  process.env.ACCESS_TOKEN_SECRET ||
  "gossipkaro-dev-otp-secret";

const hashOtp = (purpose, email, otp) =>
  crypto
    .createHmac("sha256", getSecret())
    .update(`${normalizePurpose(purpose)}:${normalizeEmail(email)}:${otp}`)
    .digest("hex");

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const isSameHash = (first, second) => {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && crypto.timingSafeEqual(firstBuffer, secondBuffer);
};

export function createOtpStore(redisClient, { purpose = "register" } = {}) {
  const normalizedPurpose = normalizePurpose(purpose);

  const createOtp = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    const otp = generateOtp();
    const payload = {
      hash: hashOtp(normalizedPurpose, normalizedEmail, otp),
      attempts: 0,
    };
    const key = getOtpKey(normalizedPurpose, normalizedEmail);

    if (redisClient) {
      await redisClient.set(key, JSON.stringify(payload), {
        EX: OTP_TTL_SECONDS,
      });
    } else {
      memoryStore.set(key, {
        ...payload,
        expiresAt: Date.now() + OTP_TTL_SECONDS * 1000,
      });
    }

    return {
      otp,
      expiresInSeconds: OTP_TTL_SECONDS,
    };
  };

  const verifyOtp = async (email, otp) => {
    const normalizedEmail = normalizeEmail(email);
    const key = getOtpKey(normalizedPurpose, normalizedEmail);
    let payload;
    let ttlSeconds = OTP_TTL_SECONDS;

    if (redisClient) {
      const raw = await redisClient.get(key);
      if (!raw) return { ok: false, reason: "expired" };

      payload = JSON.parse(raw);
      ttlSeconds = await redisClient.ttl(key);
    } else {
      payload = memoryStore.get(key);
      if (!payload || payload.expiresAt < Date.now()) {
        memoryStore.delete(key);
        return { ok: false, reason: "expired" };
      }

      ttlSeconds = Math.max(1, Math.ceil((payload.expiresAt - Date.now()) / 1000));
    }

    if (payload.attempts >= OTP_MAX_ATTEMPTS) {
      if (redisClient) await redisClient.del(key);
      else memoryStore.delete(key);
      return { ok: false, reason: "locked" };
    }

    const incomingHash = hashOtp(normalizedPurpose, normalizedEmail, otp);
    if (isSameHash(payload.hash, incomingHash)) {
      if (redisClient) await redisClient.del(key);
      else memoryStore.delete(key);
      return { ok: true };
    }

    const nextPayload = {
      ...payload,
      attempts: payload.attempts + 1,
    };

    if (redisClient) {
      await redisClient.set(key, JSON.stringify(nextPayload), {
        EX: Math.max(1, ttlSeconds),
      });
    } else {
      memoryStore.set(key, nextPayload);
    }

    return { ok: false, reason: "invalid" };
  };

  const deleteOtp = async (email) => {
    const key = getOtpKey(normalizedPurpose, email);
    if (redisClient) await redisClient.del(key);
    else memoryStore.delete(key);
  };

  return {
    createOtp,
    verifyOtp,
    deleteOtp,
    isRedisBacked: Boolean(redisClient),
  };
}
