// Inspecao real do schema de sessoes.
// A consulta roda contra information_schema; a avaliacao e pura e testavel.
// Nenhum valor de token_hash e lido ou impresso.

export const SESSION_COLUMNS_QUERY = `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = current_schema()
    AND table_name = 'sessions'
`;

export const REQUIRED_SESSION_COLUMNS = ["id", "user_id", "token_hash", "expires_at"];

export const FORBIDDEN_SESSION_COLUMNS = [
  "token",
  "raw_token",
  "session_token",
  "token_plain",
  "plain_token",
  "access_token",
  "refresh_token",
];

export function evaluateSessionSchema(columnNames = []) {
  const columns = columnNames.map((name) => String(name).toLowerCase());
  const present = new Set(columns);

  const missingRequired = REQUIRED_SESSION_COLUMNS.filter((column) => !present.has(column));
  const rawTokenColumns = FORBIDDEN_SESSION_COLUMNS.filter((column) => present.has(column));

  return {
    inspected: columns.length > 0,
    columns,
    missingRequired,
    rawTokenColumns,
    tokenHashExists: present.has("token_hash"),
    rawTokenColumnExists: rawTokenColumns.length > 0,
    ok: columns.length > 0 && missingRequired.length === 0 && rawTokenColumns.length === 0,
  };
}

export async function inspectSessionSchema(db) {
  if (!db) return evaluateSessionSchema([]);
  const result = await db.query(SESSION_COLUMNS_QUERY);
  return evaluateSessionSchema(result.rows.map((row) => row.column_name));
}
