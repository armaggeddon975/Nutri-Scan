import { query } from "../database/pool.js";

// Leituras e remocao da CONTA INTEIRA de um titular (v0.8.0).
//
// TODA consulta filtra por `user_id` (ou `id`) dentro do SQL, como nos
// repositorios de historico e favoritos: a linha de outro usuario nunca sai da
// tabela.
//
// AS COLUNAS SAO LISTADAS, NUNCA `SELECT *`
//
// A exportacao e um arquivo que sai do sistema e vai parar no computador da
// pessoa, em e-mail, em backup. O que entrar nele, saiu. Listar as colunas e o
// que garante que `password_hash`, `password_salt`, o `id` interno e qualquer
// coluna que alguem acrescente no futuro NAO entrem por acidente: uma coluna
// nova so aparece na exportacao se alguem a escrever aqui, de proposito.

const COLUNAS_DA_CONTA = "name, email, created_at";

export async function lerConta(userId, client = { query }) {
  const { rows } = await client.query(`SELECT ${COLUNAS_DA_CONTA} FROM users WHERE id = $1`, [userId]);
  return rows[0] ? { nome: rows[0].name, email: rows[0].email, criadaEm: rows[0].created_at } : null;
}

export async function lerAlergias(userId, client = { query }) {
  const { rows } = await client.query(
    "SELECT allergy_id, alert_level, created_at FROM user_allergies WHERE user_id = $1 ORDER BY allergy_id",
    [userId],
  );
  return rows;
}

// O `id` da linha fica de fora: serve ao banco, nao ao titular.
export async function lerHistorico(userId, client = { query }) {
  const { rows } = await client.query(
    `SELECT product_code, product_name, product_brand, image_url, viewed_at
       FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC`,
    [userId],
  );
  return rows;
}

export async function lerFavoritos(userId, client = { query }) {
  const { rows } = await client.query(
    `SELECT product_code, product_name, product_brand, image_url, created_at
       FROM product_favorites WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

// EXCLUSAO
//
// Recebe o `client` da transacao. Nao abre transacao propria: quem chama decide
// o limite atomico, e ele precisa cobrir as duas remocoes juntas.
//
// As sessoes saem por DELETE explicito, e nao so pela cascata: "encerrar todas
// as sessoes, em todos os aparelhos" e uma das promessas da exclusao, e fica
// escrita aqui em vez de depender de quem ler o schema. A cascata continua
// existindo por baixo. Alergias, historico e favoritos saem pela cascata do
// schema (`ON DELETE CASCADE` nas quatro tabelas que referenciam `users`).
export async function removerSessoes(userId, client) {
  const resultado = await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  return resultado.rowCount;
}

export async function removerUsuario(userId, client) {
  const resultado = await client.query("DELETE FROM users WHERE id = $1 RETURNING id", [userId]);
  return resultado.rowCount;
}
