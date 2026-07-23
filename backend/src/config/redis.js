import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const connectRedis = async (io) => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.log("Redis not configured. Socket.IO is running in single-instance mode.");
    return {
      enabled: false,
      presenceClient: null,
      otpClient: null,
      rateLimitClient: null,
    };
  }

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  const presenceClient = pubClient.duplicate();
  const otpClient = pubClient.duplicate();
  const rateLimitClient = pubClient.duplicate();

  const onError = (label) => (error) => {
    console.error(`${label} Redis error:`, error.message);
  };

  pubClient.on("error", onError("Pub"));
  subClient.on("error", onError("Sub"));
  presenceClient.on("error", onError("Presence"));
  otpClient.on("error", onError("OTP"));
  rateLimitClient.on("error", onError("Rate limit"));

  try {
    await Promise.all([
      pubClient.connect(),
      subClient.connect(),
      presenceClient.connect(),
      otpClient.connect(),
      rateLimitClient.connect(),
    ]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Redis connected. Socket.IO Redis adapter enabled.");

    return {
      enabled: true,
      presenceClient,
      otpClient,
      rateLimitClient,
    };
  } catch (error) {
    if (process.env.REDIS_REQUIRED === "true") {
      throw error;
    }

    console.warn(
      `Redis unavailable (${error.message}). Falling back to single-instance Socket.IO mode.`,
    );

    await Promise.allSettled([
      pubClient.quit(),
      subClient.quit(),
      presenceClient.quit(),
      otpClient.quit(),
      rateLimitClient.quit(),
    ]);

    return {
      enabled: false,
      presenceClient: null,
      otpClient: null,
      rateLimitClient: null,
    };
  }
};

export default connectRedis;
