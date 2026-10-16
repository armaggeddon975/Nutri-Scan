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

// Alergias e niveis numa consulta so (v0.9.0), para o perfil publico: as duas
// coisas saem do mesmo instante do banco.
export async function getUserAllergyProfile(userId, client = { query }) {
  const result = await client.query(
    "SELECT allergy_id, alert_level FROM user_allergies WHERE user_id = $1 ORDER BY allergy_id",
    [userId],
  );
  return {
    allergies: result.rows.map((row) => row.allergy_id),
    alertLevels: Object.fromEntries(result.rows.map((row) => [row.allergy_id, row.alert_level])),
  };
}

// Nivel de alerta de cada alergia do perfil (v0.9.0): `{ allergyId: nivel }`,
// com uma entrada para CADA alergia - `standard` incluida, explicito.
export async function getUserAlertLevels(userId, client = { query }) {
  const result = await client.query(
    "SELECT allergy_id, alert_level FROM user_allergies WHERE user_id = $1 ORDER BY allergy_id",
    [userId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.allergy_id, row.alert_level]));
}

// `alertLevels` so traz o que nao e `standard`: alergia ausente do mapa grava o
// padrao da coluna. A validacao ja garantiu que toda chave do mapa esta em
// `allergies` - nivel de alergia que a pessoa nao tem nao chega aqui.
export async function replaceUserAllergies(userId, allergies, client, alertLevels = {}) {
  await client.query("DELETE FROM user_allergies WHERE user_id = $1", [userId]);
  for (const allergyId of allergies) {
    const nivel = Object.prototype.hasOwnProperty.call(alertLevels, allergyId) ? alertLevels[allergyId] : "standard";
    await client.query(
      "INSERT INTO user_allergies (user_id, allergy_id, alert_level) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [userId, allergyId, nivel],
    );
  }
  return getUserAllergies(userId, client);
}
