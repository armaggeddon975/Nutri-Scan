import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import express from "express";

import { createApp } from "../src/app.js";
import {
  JANELA_EXPORTACAO_MS,
  TETO_EXPORTACAO_POR_IP,
  TETO_EXPORTACAO_POR_USUARIO,
  criarLimitadoresDeExportacao,
} from "../src/middleware/rateLimit.js";
import { nomeDoArquivoDeExportacao } from "../src/services/accountService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// v0.8.0 - direitos do titular: o que da para provar SEM banco.
//
// O resto - exportacao de verdade, exclusao, cascata, atomicidade - esta em
// `accountIntegration.test.js`, que precisa de PostgreSQL.

async function comServidor(app, callback) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ---------------------------------------------------------------------------
// E6 - sem sessao: 401
// ---------------------------------------------------------------------------

test("E6 sem sessao, exportar e excluir respondem 401", async () => {
  await comServidor(createApp(), async (base) => {
    const exportar = await fetch(`${base}/api/account/export`);
    assert.equal(exportar.status, 401);
    assert.equal((await exportar.json()).error.code, "UNAUTHENTICATED");

    const excluir = await fetch(`${base}/api/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "qualquer" }),
    });
    assert.equal(excluir.status, 401);
    assert.equal((await excluir.json()).error.code, "UNAUTHENTICATED");
  });
});

test("E6 cookie inventado nao vira sessao", async () => {
  await comServidor(createApp(), async (base) => {
    // Sem banco configurado ou com banco, um token que nao existe nunca e 200.
    const resposta = await fetch(`${base}/api/account/export`, {
      headers: { Authorization: "Bearer token-que-nao-existe" },
    });
    assert.notEqual(resposta.status, 200);
  });
});

// ---------------------------------------------------------------------------
// DELETE com corpo: o parser aceita, e corpo invalido cai no INVALID_JSON
// ---------------------------------------------------------------------------

test("DELETE com corpo quebrado responde 400 INVALID_JSON, antes de qualquer rota", async () => {
  await comServidor(createApp(), async (base) => {
    const resposta = await fetch(`${base}/api/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: "{ isto nao e json",
    });
    assert.equal(resposta.status, 400);
    assert.equal((await resposta.json()).error.code, "INVALID_JSON");
  });
});

// ---------------------------------------------------------------------------
// E7 - nome do arquivo sem e-mail nem nome
// ---------------------------------------------------------------------------

test("E7 o nome do arquivo e so produto e dia - sem e-mail, sem nome", () => {
  const nome = nomeDoArquivoDeExportacao("2026-10-12T15:04:05.000Z");
  assert.equal(nome, "nutriscan-meus-dados-2026-10-12.json");
  assert.match(nome, /^nutriscan-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
  // O nome nao recebe nada alem do instante: nao ha como um e-mail entrar.
  assert.equal(nomeDoArquivoDeExportacao.length, 1);
});

// ---------------------------------------------------------------------------
// E8 - o limitador proprio da exportacao
// ---------------------------------------------------------------------------

test("E8 os tetos da exportacao estao nos valores declarados", () => {
  assert.equal(TETO_EXPORTACAO_POR_USUARIO, 5);
  assert.equal(TETO_EXPORTACAO_POR_IP, 20);
  assert.equal(JANELA_EXPORTACAO_MS, 24 * 60 * 60 * 1000);
  // Mais restritivo que o de colecoes (300 por usuario em 10 minutos), como o
  // prompt exige.
  assert.ok(TETO_EXPORTACAO_POR_USUARIO < 300);
});

function appComLimitador(limitadores, usuario) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = usuario(req);
    next();
  });
  app.get("/x", ...limitadores, (_req, res) => res.json({ ok: true }));
  return app;
}

test("E8 o limitador de PRODUCAO recusa a sexta exportacao do mesmo usuario no dia", async () => {
  // A fabrica com os valores padrao e o mesmo codigo da rota, com os mesmos
  // numeros - num balde proprio, para nao gastar a cota dos outros testes.
  const app = appComLimitador(criarLimitadoresDeExportacao(), () => ({ id: "titular-unico" }));
  await comServidor(app, async (base) => {
    for (let i = 1; i <= TETO_EXPORTACAO_POR_USUARIO; i += 1) {
      assert.equal((await fetch(`${base}/x`)).status, 200, `exportacao ${i} recusada`);
    }
    assert.equal((await fetch(`${base}/x`)).status, 429, "a sexta exportacao passou");
  });
});

test("E8 usuario dentro da cota mas IP esgotado recebe 429 - o mais restritivo vence", async () => {
  let n = 0;
  const app = appComLimitador(criarLimitadoresDeExportacao({ tetoPorUsuario: 100, tetoPorIp: 3 }), () => ({
    id: `usuario-${(n += 1)}`,
  }));
  await comServidor(app, async (base) => {
    for (let i = 0; i < 3; i += 1) assert.equal((await fetch(`${base}/x`)).status, 200);
    // Usuario novo, cota de usuario intacta - o teto do IP manda.
    assert.equal((await fetch(`${base}/x`)).status, 429);
  });
});

test("E8 as rotas estao ligadas aos limitadores certos", async () => {
  const fonte = await readFile(path.join(backendRoot, "src/routes/accountRoutes.js"), "utf8");
  // Exportar: sessao primeiro (o balde e por usuario), depois o limitador proprio.
  assert.match(fonte, /\.get\("\/export", requireAuth, exportRateLimit, exportar\)/);
  // Excluir: o limitador de AUTENTICACAO - cada tentativa testa uma senha.
  assert.match(fonte, /\.delete\("\/", authRateLimit, requireAuth, excluir\)/);
  // E nunca o de colecoes, que e 300 por usuario.
  assert.doesNotMatch(fonte, /collectionsRateLimit/);
});

// ---------------------------------------------------------------------------
// Nenhuma das rotas novas fala com a IA
// ---------------------------------------------------------------------------

// So o codigo: os comentarios citam "Anthropic", "SELECT *" e "password"
// justamente para explicar por que eles nao estao no codigo.
async function codigoSemComentarios(arquivo) {
  const fonte = await readFile(path.join(backendRoot, arquivo), "utf8");
  return fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

test("as rotas de conta nao importam nada da Anthropic", async () => {
  for (const arquivo of [
    "src/routes/accountRoutes.js",
    "src/controllers/accountController.js",
    "src/services/accountService.js",
    "src/repositories/accountRepository.js",
  ]) {
    const codigo = await codigoSemComentarios(arquivo);
    assert.doesNotMatch(codigo, /from "\.\.\/ai\/|anthropic/i, `${arquivo} referencia a IA`);
  }
});

test("a exportacao lista as colunas da conta e nunca usa SELECT *", async () => {
  const codigo = await codigoSemComentarios("src/repositories/accountRepository.js");
  assert.doesNotMatch(codigo, /SELECT \*/i);
  assert.doesNotMatch(codigo, /password|token_hash/i, "o repositorio da conta le material de senha ou sessao");
});

test("exclusao e fisica: nada de deleted_at, nada de copia", async () => {
  for (const arquivo of ["src/services/accountService.js", "src/repositories/accountRepository.js"]) {
    const codigo = await codigoSemComentarios(arquivo);
    assert.doesNotMatch(codigo, /deleted_at|soft.?delete|INSERT INTO/i, `${arquivo} guarda ou marca em vez de apagar`);
  }
});
