import { env } from "../config/env.js";
import { getPool } from "../database/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const health = asyncHandler(async (_req, res) => {
  let database = "not_configured";

  const pool = getPool();
  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch {
      database = "error";
    }
  }

  res.json({
    status: database === "error" ? "degraded" : "ok",
    database,
    ai: env.anthropicApiKey ? "configured" : "not_configured",
    aiProvider: env.aiProvider,
    version: env.version,
  });
});
