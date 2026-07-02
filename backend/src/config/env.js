import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true, quiet: true });

const defaultOrigins = "http://localhost:5173,http://127.0.0.1:5173";

export const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigins)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
