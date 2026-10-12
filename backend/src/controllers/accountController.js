import { clearSessionCookie } from "../services/authService.js";
import {
  excluirConta,
  exportarDadosDoTitular,
  nomeDoArquivoDeExportacao,
} from "../services/accountService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// As duas rotas usam `req.user.id`, preenchido por `requireAuth` a partir da
// sessao. `req.body`, `req.query` e os cabecalhos NUNCA escolhem o titular.

export const exportar = asyncHandler(async (req, res) => {
  const dados = await exportarDadosDoTitular(req.user.id);

  // ENTREGA: download direto, com o JSON no corpo.
  //
  // `Content-Disposition: attachment` faz o navegador salvar o arquivo mesmo
  // quando a rota e aberta por link, e o app usa o mesmo nome ao montar o
  // download. O nome nao leva e-mail nem nome do titular.
  //
  // CACHE: `no-store` proibe guardar a resposta em QUALQUER cache - proxy,
  // CDN, cache do navegador. E o unico valor que impede a copia; `no-cache` e
  // `private` ainda deixariam guardar. `Pragma: no-cache` cobre intermediario
  // antigo, que so entende HTTP/1.0. Uma exportacao em cache seria entregue de
  // novo a quem passasse pelo mesmo caminho depois.
  res.set({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    "Content-Disposition": `attachment; filename="${nomeDoArquivoDeExportacao(dados.geradoEm)}"`,
  });
  res.json(dados);
});

export const excluir = asyncHandler(async (req, res) => {
  await excluirConta(req.user.id, req.body);
  clearSessionCookie(res);
  res.set("Cache-Control", "no-store");
  res.json({ ok: true });
});
