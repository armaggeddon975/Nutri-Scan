import pg from "pg";

import { env } from "../config/env.js";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!env.databaseUrl) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
    });
  }

  return pool;
}

export async function closePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function query(text, params) {
  const db = getPool();
  if (!db) {
    const error = new Error("DATABASE_URL não configurada.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }
  return db.query(text, params);
}

export async function withTransaction(callback) {
  const db = getPool();
  if (!db) {
    const error = new Error("DATABASE_URL não configurada.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
