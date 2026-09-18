import { randomUUID } from "node:crypto";

import { query } from "../database/pool.js";

// Historico de consultas de produto, por usuario.
//
// TODA consulta daqui filtra por `user_id` dentro do SQL. Isso nao e estilo: e
// a barreira de isolamento. Filtrar na aplicacao depois de ler deixaria a linha
// de outro usuario passar pelo banco, chegar ao processo e depender de um `if`
// para nao vazar. No SQL, a linha nunca sai da tabela.
//
// Nenhuma funcao daqui devolve veredito de alergia, porque a tabela nao guarda
// nenhum. O veredito e sempre recalculado na exibicao, com o perfil atual.

const COLUNAS = `
  id,
  product_code   AS "productCode",
  product_name   AS "productName",
  product_brand  AS "productBrand",
  image_url      AS "imageUrl",
  viewed_at      AS "viewedAt"
`;

export async function listHistory(userId, client = { query }) {
  const resultado = await client.query(
    `SELECT ${COLUNAS} FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC`,
    [userId],
  );
  return resultado.rows;
}

export async function countHistory(userId, client = { query }) {
  const resultado = await client.query(
    "SELECT COUNT(*)::int AS total FROM product_history WHERE user_id = $1",
    [userId],
  );
  return resultado.rows[0]?.total ?? 0;
}

// Registra a consulta. Consultar o mesmo produto de novo ATUALIZA a linha
// existente em vez de criar outra.
//
// A deduplicacao acontece no `ON CONFLICT` da restricao de unicidade do banco,
// e nao num SELECT seguido de INSERT. Duas requisicoes simultaneas do mesmo
// produto passariam as duas por um SELECT que nao encontra nada, e as duas
// tentariam inserir; so o banco pode resolver isso sem corrida.
//
// REGRA DE CONFLITO DE ESCRITA: vence a ultima escrita, medida pelo relogio do
// servidor (`now()`), nunca por horario enviado pelo cliente. Nome e marca
// tambem sao atualizados, porque a Open Food Facts corrige cadastro com o
// tempo e o registro mais novo e o mais fiel.
export async function recordView(userId, produto, client = { query }) {
  const resultado = await client.query(
    `INSERT INTO product_history (id, user_id, product_code, product_name, product_brand, image_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT product_history_user_product_unique
     DO UPDATE SET
       product_name  = EXCLUDED.product_name,
       product_brand = EXCLUDED.product_brand,
       image_url     = EXCLUDED.image_url,
       viewed_at     = now()
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
  return resultado.rows[0];
}

// Mantem no maximo `limite` itens do usuario, descartando os mais antigos.
//
// A subconsulta tambem filtra por usuario. Sem isso, o `NOT IN` compararia
// contra os ids mais recentes da tabela INTEIRA, e o historico de um usuario
// ativo apagaria o de todos os outros.
export async function pruneHistory(userId, limite, client = { query }) {
  const resultado = await client.query(
    `DELETE FROM product_history
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM product_history
           WHERE user_id = $1
           ORDER BY viewed_at DESC
           LIMIT $2
        )
      RETURNING id`,
    [userId, limite],
  );
  return resultado.rowCount;
}

// Devolve o id removido, ou null. O chamador nao consegue distinguir "item de
// outro usuario" de "item inexistente", que e exatamente o comportamento
// exigido: nao vazar a existencia de recurso alheio.
export async function deleteHistoryItem(userId, itemId, client = { query }) {
  const resultado = await client.query(
    "DELETE FROM product_history WHERE user_id = $1 AND id = $2 RETURNING id",
    [userId, itemId],
  );
  return resultado.rows[0]?.id ?? null;
}

export async function clearHistory(userId, client = { query }) {
  const resultado = await client.query(
    "DELETE FROM product_history WHERE user_id = $1 RETURNING id",
    [userId],
  );
  return resultado.rowCount;
}
