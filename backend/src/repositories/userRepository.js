import { query } from "../database/pool.js";

export async function findUserByEmailOrNameKey(identifier, nameKey) {
  const result = await query(
    "SELECT * FROM users WHERE email = $1 OR name_key = $2 LIMIT 1",
    [identifier, nameKey],
  );
  return result.rows[0] || null;
}

export async function findUserById(userId, client = { query }) {
  const result = await client.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [userId]);
  return result.rows[0] || null;
}

export async function findUserConflict(email, nameKey, client) {
  const result = await client.query(
    "SELECT email, name_key FROM users WHERE email = $1 OR name_key = $2 LIMIT 1",
    [email, nameKey],
  );
  return result.rows[0] || null;
}

export async function createUser(user, client) {
  const result = await client.query(
    `INSERT INTO users (id, name, name_key, email, password_hash, password_salt)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [user.id, user.name, user.nameKey, user.email, user.passwordHash, user.passwordSalt],
  );
  return result.rows[0];
}

export async function getUserAllergies(userId, client = { query }) {
  const result = await client.query(
    "SELECT allergy_id FROM user_allergies WHERE user_id = $1 ORDER BY allergy_id",
    [userId],
  );
  return result.rows.map((row) => row.allergy_id);
}

export async function replaceUserAllergies(userId, allergies, client) {
  await client.query("DELETE FROM user_allergies WHERE user_id = $1", [userId]);
  for (const allergyId of allergies) {
    await client.query(
      "INSERT INTO user_allergies (user_id, allergy_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, allergyId],
    );
  }
  return getUserAllergies(userId, client);
}
