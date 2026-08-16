import { query } from "../database/pool.js";

export async function createSession(session, client = { query }) {
  const result = await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [session.id, session.userId, session.tokenHash, session.expiresAt],
  );
  return result.rows[0];
}

export async function findSessionByTokenHash(tokenHash) {
  const result = await query(
    `SELECT sessions.*, users.name, users.email, users.created_at AS user_created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  return result.rows[0] || null;
}

export async function touchSession(sessionId) {
  await query("UPDATE sessions SET last_used_at = now() WHERE id = $1", [sessionId]);
}

export async function deleteSessionByTokenHash(tokenHash) {
  await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteExpiredSessions() {
  await query("DELETE FROM sessions WHERE expires_at <= now()");
}
