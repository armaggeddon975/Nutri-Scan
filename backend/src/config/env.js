import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../..");

dotenv.config({
  path: path.join(backendRoot, ".env"),
  override: false,
  quiet: true,
});

const APP_VERSION = "0.6.6";
const AI_PROVIDER = "anthropic";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const VALID_NODE_ENVS = new Set(["development", "test", "production"]);

function parsePort(value, fallback = 3000) {
  const port = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  return fallback;
}

function parseNodeEnv(value) {
  const normalized = String(value || "development").trim().toLowerCase();
  return VALID_NODE_ENVS.has(normalized) ? normalized : "development";
}

export const env = {
  version: APP_VERSION,
  nodeEnv: parseNodeEnv(process.env.NODE_ENV),
  port: parsePort(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  // Atras de proxy (Render, Fly, Nginx) o Express precisa confiar no
  // X-Forwarded-For para o rate limit contar por visitante, nao por proxy.
  trustProxy: parseBoolean(process.env.TRUST_PROXY, parseNodeEnv(process.env.NODE_ENV) === "production"),
  sessionTtlDays: parsePositiveInt(process.env.SESSION_TTL_DAYS, 30),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "nutriscan_session",
  aiProvider: AI_PROVIDER,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
  anthropicTimeoutMs: parsePositiveInt(process.env.ANTHROPIC_TIMEOUT_MS, 20000),
  anthropicMaxOutputTokens: parsePositiveInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 1200),
  backendRoot,
};

export function isProduction() {
  return env.nodeEnv === "production";
}
