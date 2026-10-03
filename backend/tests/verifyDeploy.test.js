import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import express from "express";

import { createApp } from "../src/app.js";
import { criarDist } from "./helpers/producao.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const scriptVerify = path.join(rootDir, "scripts/verify-deploy.js");

const { FAIL, NOT_EXECUTED, PASS, SONDA_INEXISTENTE, SUBGATES, agregar, verificarDeploy } = await import(
  pathToFileURL(scriptVerify).href
);

// v0.7.5 - verify:deploy.
//
// O comando que prova, contra uma URL publicada, que o que esta no ar e o que
// foi auditado. Aqui ele e exercitado contra deploys SIMULADOS - um perfeito, e
// variantes quebradas um subgate de cada vez - e contra o roteador real do app,
// com um espiao contando cada requisicao que chega.

const BASE = "https://deploy.nutriscan.test";
const VERSAO = "0.7.5";

const HTML = '<!doctype html><title>NutriScan</title><script type="module" src="/assets/app.js"></script>';

// Isca de chave para o D8, montada por partes. Ela precisa ter forma de chave
// Anthropic NO BUNDLE SERVIDO, para o D8 ter o que pegar - mas nao pode existir
// como literal neste arquivo: o secret scan do verify:release procura
// exatamente esse padrao no codigo-fonte, e estaria certo em reprovar.
const ISCA_DE_CHAVE = ["sk", "ant", "api03", "ABCDEFGHIJKLMNOPQRSTUV"].join("-");

// Deploy simulado. `quebra` estraga UM aspecto, para provar que o subgate
// correspondente - e so ele - pega.
function deploySimulado({ versao = VERSAO, quebra = null } = {}) {
  const chamadas = [];

  const cabecalhosSeguros = {
    "strict-transport-security": quebra === "hsts" ? "" : "max-age=31536000; includeSubDomains",
    "content-security-policy": "default-src 'self'",
    "x-content-type-options": "nosniff",
  };

  function responder(corpo, status, tipo, extras = {}) {
    return new Response(corpo, {
      status,
      headers: { "content-type": tipo, ...cabecalhosSeguros, ...extras },
    });
  }

  async function fetchFalso(entrada, opcoes = {}) {
    const url = new URL(String(entrada));
    const metodo = (opcoes.method || "GET").toUpperCase();
    chamadas.push({ metodo, url: url.href });

    if (url.protocol === "http:") {
      if (quebra === "sem-redirect") return responder("{}", 200, "application/json");
      return new Response(null, { status: 301, headers: { location: `https://${url.host}${url.pathname}` } });
    }

    if (metodo === "GET" && url.pathname === "/api/health") {
      return responder(JSON.stringify({ status: "ok", database: "connected", ai: "configured", version: versao }), 200, "application/json");
    }

    if (url.pathname === SONDA_INEXISTENTE) {
      if (metodo === "POST") {
        const corpo =
          quebra === "stack"
            ? JSON.stringify({ error: { message: "boom\n    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)" } })
            : JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." } });
        return responder(corpo, 500, "application/json");
      }
      if (quebra === "spa-engole-api") return responder(HTML, 200, "text/html");
      return responder(JSON.stringify({ error: { code: "NOT_FOUND" } }), 404, "application/json");
    }

    if (["/api/auth/me", "/api/history", "/api/favorites", "/api/profile"].includes(url.pathname)) {
      if (quebra === "sem-auth" && url.pathname === "/api/history") {
        return responder(JSON.stringify({ items: [] }), 200, "application/json");
      }
      return responder(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), 401, "application/json");
    }

    if (url.pathname === "/") return responder(HTML, 200, "text/html");

    if (url.pathname === "/assets/app.js") {
      const js = quebra === "chave" ? `const k="${ISCA_DE_CHAVE}";` : "console.log('app');";
      return responder(js, 200, "application/javascript");
    }

    return responder(JSON.stringify({ error: { code: "NOT_FOUND" } }), 404, "application/json");
  }

  return { fetchFalso, chamadas };
}

function estadoDe(saida, id) {
  return saida.resultados.find((r) => r.id === id)?.estado;
}

// ---------------------------------------------------------------------------
// P10 - sem URL, falha com instrucao
// ---------------------------------------------------------------------------

test("P10 verify:deploy sem URL falha e explica como informar", () => {
  const ambiente = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const saida = spawnSync(process.execPath, [scriptVerify], { cwd: rootDir, env: ambiente, encoding: "utf8" });

  assert.equal(saida.status, 1, `codigo de saida ${saida.status}`);
  assert.match(saida.stderr, /nenhuma URL de deploy informada/);
  assert.match(saida.stderr, /DEPLOY_URL=/, "a instrucao nao mostra como informar");
  assert.match(saida.stderr, /nunca assume localhost/);

  // E nao consultou nada: sem URL, nao ha alvo.
  assert.doesNotMatch(saida.stdout, /\[PASS\]/);
});

test("P10 verify:deploy nao assume localhost nem em URL invalida", () => {
  const ambiente = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  const saida = spawnSync(process.execPath, [scriptVerify, "   "], { cwd: rootDir, env: ambiente, encoding: "utf8" });
  assert.equal(saida.status, 1);
  assert.doesNotMatch(saida.stdout + saida.stderr, /localhost:\d+.*PASS/);
});

// ---------------------------------------------------------------------------
// P11 - um subgate que falha derruba o agregado
// ---------------------------------------------------------------------------

test("P11 deploy perfeito: os oito subgates passam", async () => {
  const { fetchFalso } = deploySimulado();
  const saida = await verificarDeploy({ base: BASE, versaoLocal: VERSAO, fetchImpl: fetchFalso });

  for (const r of saida.resultados) assert.equal(r.estado, PASS, `${r.id}: ${r.detalhe}`);
  assert.equal(saida.resultados.length, 8);
  assert.equal(saida.aprovado, true);
});

test("P11 cada defeito derruba o seu subgate e o agregado", async () => {
  const casos = [
    ["hsts", "D3"],
    ["sem-redirect", "D2"],
    ["spa-engole-api", "D4"],
    ["sem-auth", "D5"],
    ["stack", "D6"],
    ["chave", "D8"],
  ];

  for (const [quebra, subgate] of casos) {
    const { fetchFalso } = deploySimulado({ quebra });
    const saida = await verificarDeploy({ base: BASE, versaoLocal: VERSAO, fetchImpl: fetchFalso });

    assert.equal(estadoDe(saida, subgate), FAIL, `${quebra} nao derrubou ${subgate}`);
    assert.equal(saida.aprovado, false, `${quebra} derrubou ${subgate} mas o agregado passou`);
  }
});

test("P11 alvo http:// reprova o D2, e o agregado", async () => {
  const { fetchFalso } = deploySimulado();
  const saida = await verificarDeploy({ base: "http://deploy.nutriscan.test", versaoLocal: VERSAO, fetchImpl: fetchFalso });
  assert.equal(estadoDe(saida, "D2"), FAIL);
  assert.equal(saida.aprovado, false);
});

test("P11 rede fora: nenhum subgate vira PASS", async () => {
  const saida = await verificarDeploy({
    base: BASE,
    versaoLocal: VERSAO,
    fetchImpl: async () => {
      throw new Error("rede fora");
    },
  });
  for (const r of saida.resultados) assert.notEqual(r.estado, PASS, `${r.id} passou sem rede`);
  assert.equal(saida.aprovado, false);
  // D8 depende do que D7 baixou: sem nada baixado, nao olhou - NOT_EXECUTED.
  assert.equal(estadoDe(saida, "D8"), NOT_EXECUTED);
});

test("P11 NOT_EXECUTED nao conta como PASS no agregado", () => {
  // A regra isolada. No fluxo real, NOT_EXECUTED vem sempre junto de um FAIL
  // (D8 depende de D7), e o FAIL esconderia uma regra frouxa - por isso este
  // teste monta os resultados a mao: sete PASS e um NOT_EXECUTED, nada de FAIL.
  const comEstado = (estado) => SUBGATES.map(([id]) => ({ id, estado: id === "D8" ? estado : PASS }));

  assert.equal(agregar(comEstado(PASS)), true, "oito PASS deveriam aprovar");
  assert.equal(agregar(comEstado(NOT_EXECUTED)), false, "NOT_EXECUTED foi aceito como aprovacao");
  assert.equal(agregar(comEstado("SKIP")), false, "um estado desconhecido foi aceito como aprovacao");
  assert.equal(agregar(comEstado(PASS).slice(1)), false, "faltando um subgate, o agregado aprovou");
  assert.equal(agregar([]), false, "sem nenhum resultado, o agregado aprovou");
});

test("P11 no fluxo real, D8 sem o que inspecionar sai NOT_EXECUTED e reprova", async () => {
  const { fetchFalso } = deploySimulado();
  // So "/" quebra: D7 falha, D8 nao tem o que inspecionar.
  const quebrarRaiz = async (entrada, opcoes) => {
    if (new URL(String(entrada)).pathname === "/") throw new Error("raiz fora");
    return fetchFalso(entrada, opcoes);
  };
  const saida = await verificarDeploy({ base: BASE, versaoLocal: VERSAO, fetchImpl: quebrarRaiz });
  assert.equal(estadoDe(saida, "D8"), NOT_EXECUTED);
  assert.equal(saida.aprovado, false, "NOT_EXECUTED foi aceito como aprovacao");
});

// ---------------------------------------------------------------------------
// P12 - versao divergente e FALHA (o achado R3 virando gate)
// ---------------------------------------------------------------------------

test("P12 versao no ar diferente da do repositorio reprova o D1", async () => {
  // Varias destas CONTEM "0.7.5" como trecho. Uma comparacao por `includes` ou
  // por prefixo aprovaria todas - e "0.7.50" nao e "0.7.5".
  for (const noAr of ["0.7.50", "10.7.5", "0.7.5-rc1", "v0.7.5", "0.7.4", "", "0.7.5 "]) {
    const { fetchFalso } = deploySimulado({ versao: noAr });
    const saida = await verificarDeploy({ base: BASE, versaoLocal: VERSAO, fetchImpl: fetchFalso });
    assert.equal(estadoDe(saida, "D1"), FAIL, `"${noAr}" foi aceito como "${VERSAO}"`);
    assert.equal(saida.aprovado, false);
  }
});

test("P12 versao identica aprova o D1", async () => {
  const { fetchFalso } = deploySimulado({ versao: VERSAO });
  const saida = await verificarDeploy({ base: BASE, versaoLocal: VERSAO, fetchImpl: fetchFalso });
  assert.equal(estadoDe(saida, "D1"), PASS);
});

// ---------------------------------------------------------------------------
// P13 - verify:deploy nao escreve
// ---------------------------------------------------------------------------

// Toda rota do backend que persiste alguma coisa, ou chama a Anthropic.
const ROTAS_DE_ESCRITA = [
  ["POST", /^\/api\/auth\/(register|login|logout)$/],
  ["PUT", /^\/api\/profile/],
  ["POST", /^\/api\/history/],
  ["DELETE", /^\/api\/history/],
  ["POST", /^\/api\/favorites/],
  ["DELETE", /^\/api\/favorites/],
  ["POST", /^\/api\/assistant/],
];

function eEscrita(metodo, caminho) {
  return ROTAS_DE_ESCRITA.some(([m, regex]) => m === metodo && regex.test(caminho.toLowerCase()));
}

test("P13 o registro de requisicoes do verify:deploy nao tem escrita", async () => {
  const { fetchFalso, chamadas } = deploySimulado();
  const saida = await verificarDeploy({ base: BASE, versaoLocal: VERSAO, fetchImpl: fetchFalso });

  const naoGet = chamadas.filter((c) => c.metodo !== "GET");
  // A unica excecao declarada: o D6 manda JSON quebrado para um caminho que nao
  // existe. Mais de uma, ou para outro caminho, e defeito.
  assert.equal(naoGet.length, 1, `requisicoes que nao sao GET: ${JSON.stringify(naoGet)}`);
  assert.equal(naoGet[0].metodo, "POST");
  assert.equal(new URL(naoGet[0].url).pathname, SONDA_INEXISTENTE);

  for (const { metodo, url } of chamadas) {
    assert.equal(eEscrita(metodo, new URL(url).pathname), false, `${metodo} ${url} e rota de escrita`);
  }
  assert.ok(saida.requisicoes.length > 0);
});

test("P13 contra o roteador REAL, nenhuma rota de escrita e alcancada", async () => {
  // O app de verdade, com um espiao na frente contando cada requisicao que
  // chega. Isto prova o que o verify:deploy faz, e nao o que ele diz que faz.
  const dist = criarDist();
  const recebidas = [];
  const espiao = express();
  espiao.use((req, _res, next) => {
    recebidas.push({ metodo: req.method, caminho: req.path });
    next();
  });
  espiao.use(createApp({ distDir: dist.raiz }));

  const servidor = createServer(espiao);
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    await verificarDeploy({ base, versaoLocal: VERSAO, timeoutMs: 10000 });

    assert.ok(recebidas.length >= 8, `so ${recebidas.length} requisicoes chegaram`);
    for (const { metodo, caminho } of recebidas) {
      assert.equal(eEscrita(metodo, caminho), false, `${metodo} ${caminho} chegou ao backend`);
    }
    const naoGet = recebidas.filter((r) => r.metodo !== "GET");
    assert.ok(
      naoGet.every((r) => r.caminho === SONDA_INEXISTENTE),
      `requisicao fora de GET para rota real: ${JSON.stringify(naoGet)}`,
    );
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
    dist.remover();
  }
});

test("P11 o comando de verdade sai com codigo 1 quando um subgate falha", async () => {
  // Os outros testes de P11 olham o agregado. Este roda o PROCESSO, contra o
  // roteador real, e olha o codigo de saida - que e o que um pipeline le.
  // O alvo e http://, entao D2 reprova; D1 tem de passar, para provar que o
  // comando chegou a consultar o alvo e nao falhou antes.
  const dist = criarDist();
  const servidor = createServer(createApp({ distDir: dist.raiz }));
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    const ambiente = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_TIMEOUT_MS: "10000" };
    // spawn, e nao spawnSync: o servidor roda neste processo e precisa do
    // laco de eventos livre para responder.
    const { codigo, stdout } = await new Promise((resolve, reject) => {
      const filho = spawn(process.execPath, [scriptVerify, base], { cwd: rootDir, env: ambiente });
      let saida = "";
      filho.stdout.on("data", (parte) => (saida += parte));
      filho.on("error", reject);
      filho.on("close", (code) => resolve({ codigo: code, stdout: saida }));
    });

    assert.match(stdout, /\[PASS\s*\] D1/, `o comando nao chegou a consultar o alvo:\n${stdout}`);
    assert.match(stdout, /\[FAIL\s*\] D2/, `D2 deveria reprovar um alvo http://:\n${stdout}`);
    assert.match(stdout, /\[FAIL\] verify:deploy/);
    assert.equal(codigo, 1, `um subgate falhou e o processo saiu com ${codigo}`);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
    dist.remover();
  }
});

test("P13 a sonda do D6 nao corresponde a nenhuma rota registrada", async () => {
  // Se um dia alguem criar uma rota com esse nome, a sonda de erro passaria a
  // bater numa rota de verdade.
  const dist = criarDist();
  const servidor = createServer(createApp({ distDir: dist.raiz }));
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  try {
    const resposta = await fetch(`http://127.0.0.1:${servidor.address().port}${SONDA_INEXISTENTE}`);
    assert.equal(resposta.status, 404);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
    dist.remover();
  }
});

test("os oito subgates D1 a D8 existem", () => {
  assert.deepEqual(
    SUBGATES.map(([id]) => id),
    ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"],
  );
});
