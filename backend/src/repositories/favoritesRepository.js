import { randomUUID } from "node:crypto";

import { query } from "../database/pool.js";

// Favoritos, por usuario.
//
// Mesmas regras do historico: filtro por `user_id` sempre dentro do SQL, e
// nenhuma coluna de veredito de alergia.
//
// A diferenca de comportamento em relacao ao historico esta no limite. O
// historico e um registro automatico e poda sozinho o mais antigo. Favorito e
// intencao explicita do usuario: descartar um em silencio para caber outro
// seria apagar uma escolha que ele fez. Por isso o limite aqui vira erro, e a
// decisao de o que remover fica com ele.

const COLUNAS = `
  id,
  product_code   AS "productCode",
  product_name   AS "productName",
  product_brand  AS "productBrand",
  image_url      AS "imageUrl",
  created_at     AS "createdAt"
`;

export async function listFavorites(userId, client = { query }) {
  const resultado = await client.query(
    `SELECT ${COLUNAS} FROM product_favorites WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return resultado.rows;
}

export async function countFavorites(userId, client = { query }) {
  const resultado = await client.query(
    "SELECT COUNT(*)::int AS total FROM product_favorites WHERE user_id = $1",
    [userId],
  );
  return resultado.rows[0]?.total ?? 0;
}

export async function findFavoriteByCode(userId, productCode, client = { query }) {
  const resultado = await client.query(
    `SELECT ${COLUNAS} FROM product_favorites WHERE user_id = $1 AND product_code = $2 LIMIT 1`,
    [userId, productCode],
  );
  return resultado.rows[0] ?? null;
}

// Marcar duas vezes nao cria duas linhas nem estoura erro: o `ON CONFLICT DO
// NOTHING` deixa a restricao do banco resolver, e o chamador recebe a linha que
// ja existia. Repetir a mesma intencao e ruido de rede ou toque duplo, nao erro
// do usuario.
export async function addFavorite(userId, produto, client = { query }) {
  const resultado = await client.query(
    `INSERT INTO product_favorites (id, user_id, product_code, product_name, product_brand, image_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT product_favorites_user_product_unique DO NOTHING
     RETURNING ${COLUNAS}`,
    [
      randomUUID(),
      userId,
      produto.productCode,
      produto.productName,
      produto.productBrand ?? null,
      produto.imageUrl ?? null,
    ],
  );

  if (resultado.rows[0]) return { favorito: resultado.rows[0], criado: true };

  const existente = await findFavoriteByCode(userId, produto.productCode, client);
  return { favorito: existente, criado: false };
}

export async function removeFavorite(userId, favoriteId, client = { query }) {
  const resultado = await client.query(
    "DELETE FROM product_favorites WHERE user_id = $1 AND id = $2 RETURNING id",
    [userId, favoriteId],
  );
  return resultado.rows[0]?.id ?? null;
}

export async function removeFavoriteByCode(userId, productCode, client = { query }) {
  const resultado = await client.query(
    "DELETE FROM product_favorites WHERE user_id = $1 AND product_code = $2 RETURNING id",
    [userId, productCode],
  );
  return resultado.rows[0]?.id ?? null;
}
