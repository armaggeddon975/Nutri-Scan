import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import express from "express";

import { collectionsRateLimit, collectionsRateLimitKey } from "../src/middleware/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const origemDoLimitador = path.join(rootDir, "backend/src/middleware/rateLimit.js");

// D1 da auditoria externa da v0.7.0.
//
// A suite de integracao rodava todos os testes contra o mesmo servidor, do
// mesmo IP, na mesma janela. F4 sozinho faz 201 requisicoes, H3 faz mais de
// 100; o teto de 300 POR IP estourava no oitavo teste e nove testes falhavam
// com `SyntaxError: Unexpected token 'T', "Too many r"...`.
//
// Entre os que falhavam estavam I1, I2 e I3 - os de isolamento entre contas.
// Eles nunca tinham rodado com sucesso: sem banco ficavam em SKIP, com banco
// falhavam por quota.
//
// A chave passou a ser o usuario da sessao. Estes testes existem para que a
// correcao nao possa ser desfeita em silencio, e para provar que o limite de
// producao continua valendo.

async function comServidor(callback, { usuarioFixo = null } = {}) {
  const app = express();
  // Simula o `requireAuth`, que roda ANTES do limitador nas rotas reais: e
  // dele que vem `req.user`.
  //
  // Com `usuarioFixo`, a sessao e sempre a mesma pessoa, independentemente do
  // que a requisicao carrega. E assim que se testa se o limitador esta olhando
  // para a sessao ou para algo que o cliente controla.
  app.use((req, _res, next) => {
    if (usuarioFixo) {
      req.user = { id: usuarioFixo };
    } else {
      const id = req.get("x-teste-usuario");
      if (id) req.user = { id };
    }
    next();
  });
  app.use(collectionsRateLimit);
  app.get("/", (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function bater(baseUrl, vezes, usuario) {
  const codigos = [];
  for (let i = 0; i < vezes; i += 1) {
    const resposta = await fetch(baseUrl, {
      headers: usuario ? { "x-teste-usuario": usuario } : {},
    });
    codigos.push(resposta.status);
  }
  return codigos;
}

async function baterCom(baseUrl, { headers = {}, caminho = "/" } = {}) {
  const resposta = await fetch(new URL(caminho, baseUrl), { headers });
  return resposta.status;
}

// Os comentarios deste arquivo descrevem justamente o que nao pode existir no
// codigo - "nenhuma variavel de ambiente", "nenhum cabecalho". Casar a
// expressao contra eles acusaria um defeito que nao esta la.
function semComentarios(fonte) {
  return fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Q5 - os limites de producao seguem nos valores declarados
// ---------------------------------------------------------------------------

test("Q5 os tres limitadores mantem janela e teto declarados", async () => {
  const fonte = await readFile(origemDoLimitador, "utf8");

  const blocos = {
    authRateLimit: { janela: "15 * 60 * 1000", teto: "40" },
    assistantRateLimit: { janela: "10 * 60 * 1000", teto: "20" },
    collectionsRateLimit: { janela: "10 * 60 * 1000", teto: "300" },
  };

  for (const [nome, esperado] of Object.entries(blocos)) {
    const inicio = fonte.indexOf(`export const ${nome} = rateLimit({`);
    assert.ok(inicio !== -1, `limitador ${nome} sumiu`);
    const bloco = fonte.slice(inicio, fonte.indexOf("});", inicio));

    assert.ok(
      bloco.includes(`windowMs: ${esperado.janela}`),
      `${nome} mudou de janela: esperado ${esperado.janela}`,
    );
    assert.ok(
      bloco.includes(`limit: ${esperado.teto}`),
      `${nome} mudou de teto: esperado ${esperado.teto}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Q2 - em producao, sem qualquer variavel, o limitador recusa em limite+1
// ---------------------------------------------------------------------------

test(
  "Q2 em producao o limitador recusa na requisicao seguinte ao teto",
  { timeout: 120000 },
  async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await comServidor(async (baseUrl) => {
        const TETO = 300;
        const codigos = await bater(baseUrl, TETO + 1, "usuario-do-teto");

        const permitidas = codigos.filter((c) => c === 200).length;
        assert.equal(permitidas, TETO, `esperado ${TETO} permitidas, veio ${permitidas}`);
        assert.equal(
          codigos[TETO],
          429,
          `a requisicao ${TETO + 1} deveria ser recusada, veio ${codigos[TETO]}`,
        );
      });
    } finally {
      process.env.NODE_ENV = anterior;
    }
  },
);

// ---------------------------------------------------------------------------
// A correcao propriamente dita: a cota e por usuario
// ---------------------------------------------------------------------------

test("D1 a cota de um usuario nao consome a cota de outro", { timeout: 120000 }, async () => {
  await comServidor(async (baseUrl) => {
    // O primeiro usuario gasta a cota inteira.
    const primeiro = await bater(baseUrl, 301, "usuario-a");
    assert.equal(primeiro[300], 429, "o primeiro usuario deveria ter estourado");

    // O segundo, do MESMO IP, continua atendido. Antes da correcao isto
    // devolvia 429: era exatamente o que quebrava a suite de integracao.
    const segundo = await bater(baseUrl, 5, "usuario-b");
    assert.deepEqual(segundo, [200, 200, 200, 200, 200], "o segundo usuario foi punido pelo primeiro");
  });
});

test("D1 a chave e o usuario da sessao quando ha sessao", () => {
  assert.equal(collectionsRateLimitKey({ user: { id: "u1" }, ip: "10.0.0.1" }), "user:u1");
  assert.equal(collectionsRateLimitKey({ user: { id: "u2" }, ip: "10.0.0.1" }), "user:u2");
});

test("D1 sem sessao a chave volta a ser o IP", () => {
  assert.equal(collectionsRateLimitKey({ ip: "10.0.0.1" }), "ip:10.0.0.1");
  assert.equal(collectionsRateLimitKey({ user: null, ip: "10.0.0.2" }), "ip:10.0.0.2");
  // Requisicao sem IP conhecido nao pode virar chave vazia, que juntaria todo
  // mundo no mesmo balde.
  assert.equal(collectionsRateLimitKey({}), "ip:desconhecido");
});

// ---------------------------------------------------------------------------
// Q3 e Q4 - nao ha bypass, e nao pode haver
// ---------------------------------------------------------------------------
//
// A correcao escolhida NAO criou mecanismo de desligamento. Os requisitos Q3 e
// Q4 do prompt valem "somente se escolher a abordagem de bypass"; como nao foi
// escolhida, o que se prova aqui e mais forte: que a porta nao existe.

// Prova de comportamento, e nao de texto-fonte: a sessao e sempre a MESMA
// pessoa, e o cliente tenta de tudo para conseguir um balde novo depois de
// esgotar a cota. Toda tentativa precisa continuar recebendo 429.
//
// Este teste existe porque a versao anterior dele olhava so o codigo-fonte,
// procurando `req.get`. A validacao por mutacao mostrou que `req?.get?.(`
// passava direto pela expressao: o defeito injetado sobreviveu. Casar texto e
// fragil justamente onde a propriedade importa.
test(
  "Q4 nenhum dado vindo do request consegue um balde novo",
  { timeout: 120000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const codigos = await bater(baseUrl, 301);
        assert.equal(codigos[300], 429, "a cota deveria ter esgotado");

        const tentativas = [
          { rotulo: "cabecalho de usuario", headers: { "x-usuario": "outro" } },
          { rotulo: "cabecalho de id", headers: { "x-user-id": "outro" } },
          { rotulo: "cabecalho de autor", headers: { "x-teste-usuario": "outro" } },
          { rotulo: "IP encaminhado", headers: { "x-forwarded-for": "203.0.113.9" } },
          { rotulo: "IP real", headers: { "x-real-ip": "203.0.113.9" } },
          { rotulo: "cookie", headers: { cookie: "user=outro; bypass=1" } },
          { rotulo: "desligamento por cabecalho", headers: { "x-rate-limit": "off" } },
          { rotulo: "query de usuario", caminho: "/?user=outro&userId=outro" },
          { rotulo: "query de desligamento", caminho: "/?rateLimit=off&bypass=1" },
        ];

        for (const tentativa of tentativas) {
          const codigo = await baterCom(baseUrl, tentativa);
          assert.equal(
            codigo,
            429,
            `${tentativa.rotulo} conseguiu escapar do limitador (veio ${codigo})`,
          );
        }
      },
      { usuarioFixo: "usuario-unico" },
    );
  },
);

test("Q4 o limitador nao tem opcao de pular requisicao", async () => {
  const fonte = await readFile(origemDoLimitador, "utf8");
  const codigo = semComentarios(fonte);

  // `skip` e a opcao do express-rate-limit que desliga o limitador por
  // requisicao. Ela nao deve existir aqui.
  assert.doesNotMatch(codigo, /\bskip\s*:/, "o limitador ganhou uma opcao de skip");
  assert.doesNotMatch(codigo, /skipSuccessfulRequests|skipFailedRequests/);

  // A barra vertical cobre `req.get` e `req?.get?.(`, que sao a mesma leitura
  // escrita de duas formas.
  assert.doesNotMatch(codigo, /req\??\.(get|header|headers)\b/, "o limitador le cabecalho");
  assert.doesNotMatch(codigo, /req\??\.query\b/, "o limitador le query string");
  assert.doesNotMatch(codigo, /req\??\.cookies\b/, "o limitador le cookie");
});

test("Q3 nenhuma variavel de ambiente desliga o limitador", async () => {
  const fonte = await readFile(origemDoLimitador, "utf8");
  const codigo = semComentarios(fonte);

  assert.doesNotMatch(
    codigo,
    /process\.env/,
    "o limitador passou a depender de variavel de ambiente: se ela puder ser " +
      "definida em producao, o defeito de teste virou vulnerabilidade",
  );
});

test("Q3 o limitador esta montado em todas as rotas de colecoes", async () => {
  for (const arquivo of ["historyRoutes.js", "favoritesRoutes.js"]) {
    const fonte = await readFile(path.join(rootDir, "backend/src/routes", arquivo), "utf8");
    assert.match(
      fonte,
      /\.use\(requireAuth,\s*collectionsRateLimit\)/,
      `${arquivo} nao aplica o limitador a todas as rotas`,
    );
  }
});
