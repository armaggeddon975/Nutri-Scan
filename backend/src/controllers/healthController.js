import { env } from "../config/env.js";
import { getPool } from "../database/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// O QUE O HEALTH EXPOE, E POR QUE (v0.7.5, item 6.7)
//
//   status    ok | degraded. E o que o health check da hospedagem precisa.
//   database  connected | error | not_configured. Diz se a fonte de verdade
//             esta acessivel - e o gate E2E e o `verify:deploy` dependem disso.
//             NAO diz host, porta, nome de banco nem a string de conexao.
//   ai        configured | not_configured. Presenca da chave, nunca o valor.
//   version   lida de `backend/package.json` - fonte unica (ver `env.js`). E o
//             campo que o `verify:deploy` compara com o repositorio: foi a
//             divergencia dele que produziu o achado R3 da v0.6.9.
//
// O QUE DEIXOU DE EXPOR
//
//   aiProvider  ate a v0.7.4 o health anunciava "anthropic". O CLAUDE.md do
//               projeto determina que o frontend nunca sabe qual provedor
//               respondeu e que os codigos de erro publicos sao neutros
//               (`AI_*`). O health e API publica, entao a regra vale aqui: dizer
//               o fornecedor so ajuda quem quer montar ataque especifico para
//               ele. Nenhum consumidor dependia do campo - so um teste e a
//               documentacao.
//
// Nada de variavel de ambiente, nome de host, versao de Node, uptime, memoria
// ou contagem de usuarios: nenhum desses ajuda o health check, e todos ajudam
// alguem a mapear o servidor.
export const health = asyncHandler(async (_req, res) => {
  let database = "not_configured";

  const pool = getPool();
  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = "connected";
    } catch {
      // A mensagem do erro de conexao cita host e porta. Ela nao sai daqui.
      database = "error";
    }
  }

  res.json({
    status: database === "error" ? "degraded" : "ok",
    database,
    ai: env.anthropicApiKey ? "configured" : "not_configured",
    version: env.version,
  });
});
