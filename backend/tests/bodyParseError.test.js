import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  ERROS_FORJADOS,
  ISCA_DE_BIBLIOTECA,
  criarDist,
  subirAppDeErrosForjados,
  subirAppDeProducao,
} from "./helpers/producao.js";

// v0.7.6 - achado O2.
//
// O auditor mediu em producao:
//
//   POST /api/auth/login  corpo "{nao-e-json"  ->  500 INTERNAL_ERROR
//
// O corpo da resposta estava limpo; o defeito era o STATUS. Erro do cliente
// virava alerta de servidor, e o cliente nao distinguia bug dele de bug nosso.
//
// A correcao reconhece UM caso - falha de parse do corpo - e mais nenhum. Estes
// testes provam as duas metades: o caso reconhecido vira 400, e nenhum outro
// erro, com o status que trouxer, consegue escolher o status da resposta.

// O que nao pode aparecer em resposta nenhuma: a mensagem do parser, stack,
// caminho de arquivo, e a isca que os erros forjados carregam.
const PROIBIDO_NA_RESPOSTA = [
  /Unexpected token/i,
  /Expected property/i,
  /JSON at position/i,
  /SyntaxError/,
  /\n\s+at /,
  /"stack"/,
  /node_modules/,
  /[A-Za-z]:\\\\/,
  /\/srv\//,
  /segredo\.js/,
  /detalhe-interno/,
  /SELECT \*/,
];

function vazamentos(texto) {
  return PROIBIDO_NA_RESPOSTA.filter((padrao) => padrao.test(texto)).map(String);
}

let app;
let dist;
let erros;

before(async () => {
  dist = criarDist();
  app = await subirAppDeProducao({ distDir: dist.raiz });
  erros = await subirAppDeErrosForjados();
});

after(async () => {
  await app?.encerrar();
  await erros?.encerrar();
  dist?.remover();
});

async function postarCorpo(baseUrl, caminho, corpo) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
  });
  return { resposta, texto: await resposta.text() };
}

// ---------------------------------------------------------------------------
// O2a - JSON malformado responde 400, nao 500
// ---------------------------------------------------------------------------

test("O2a JSON malformado responde 400, nao 500 - a medicao do auditor", async () => {
  // Exatamente a requisicao do relatorio do auditor.
  const { resposta, texto } = await postarCorpo(app.baseUrl, "/api/auth/login", "{nao-e-json");

  assert.equal(resposta.status, 400, `JSON malformado respondeu ${resposta.status}`);
  const corpo = JSON.parse(texto);
  assert.equal(corpo.error.code, "INVALID_JSON");
});

test("O2a o 400 vale em qualquer rota, porque o parse roda antes delas", async () => {
  for (const [caminho, corpo] of [
    ["/api/history", "{ isto nao e json"],
    ["/api/__rota_que_nao_existe", "[1, 2,"],
    ["/api/auth/register", "nao-e-json"],
  ]) {
    const { resposta, texto } = await postarCorpo(app.baseUrl, caminho, corpo);
    assert.equal(resposta.status, 400, `${caminho} respondeu ${resposta.status}`);
    assert.equal(JSON.parse(texto).error.code, "INVALID_JSON", caminho);
  }
});

test("O2a falha de parse e erro do cliente: nao aparece como erro interno no log", async () => {
  const contar = () => (app.lerStderr().match(/\[erro interno\]/g) || []).length;
  const antes = contar();
  await postarCorpo(app.baseUrl, "/api/auth/login", "{nao-e-json");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(contar(), antes, "a falha de parse foi registrada como erro interno");
});

// ---------------------------------------------------------------------------
// O2b - o 400 nao traz stack, caminho nem mensagem de biblioteca
// ---------------------------------------------------------------------------

test("O2b a resposta de 400 nao contem stack, caminho nem err.message do parser", async () => {
  const { texto } = await postarCorpo(app.baseUrl, "/api/auth/login", "{nao-e-json");
  assert.deepEqual(vazamentos(texto), [], `a resposta vazou: ${texto}`);

  // A mensagem e a NOSSA, fixa. Comparar com o texto exato garante que nada do
  // erro original foi concatenado a ela.
  const corpo = JSON.parse(texto);
  assert.deepEqual(Object.keys(corpo.error).sort(), ["code", "message"]);
  assert.equal(corpo.error.message, "O corpo da requisição não é JSON válido.");
});

// ---------------------------------------------------------------------------
// O2c - erro interno de verdade continua 500
// ---------------------------------------------------------------------------

test("O2c erro interno de verdade continua respondendo 500, sem detalhe", async () => {
  const resposta = await fetch(`${erros.baseUrl}/interno`);
  const texto = await resposta.text();
  assert.equal(resposta.status, 500);
  assert.equal(JSON.parse(texto).error.code, "INTERNAL_ERROR");
  assert.deepEqual(vazamentos(texto), [], `a resposta vazou: ${texto}`);
});

test("O2c no app real, falha do banco continua 500", async () => {
  // Cookie qualquer: `requireAuth` consulta o banco, que recusa a conexao.
  const resposta = await fetch(`${app.baseUrl}/api/auth/me`, {
    headers: { Cookie: "nutriscan_session=token-qualquer" },
  });
  const texto = await resposta.text();
  assert.equal(resposta.status, 500);
  assert.deepEqual(vazamentos(texto), []);
});

// ---------------------------------------------------------------------------
// O2d - erro de biblioteca nao escolhe o status fora do parse do corpo
// ---------------------------------------------------------------------------

test("O2d erro de biblioteca com statusCode arbitrario nao escolhe o status", async () => {
  // 418, 401, 404 e 400 - todos com `expose: true`, na forma de http-errors.
  // Nenhum e falha de parse do corpo, entao todos sao erro interno.
  for (const caso of ["lib-418", "lib-401", "lib-404", "lib-400"]) {
    const resposta = await fetch(`${erros.baseUrl}/${caso}`);
    const texto = await resposta.text();
    assert.equal(resposta.status, 500, `${caso}: o erro da biblioteca escolheu o status ${resposta.status}`);
    assert.equal(JSON.parse(texto).error.code, "INTERNAL_ERROR", caso);
    assert.equal(texto.includes(ISCA_DE_BIBLIOTECA), false, `${caso}: a mensagem da biblioteca chegou ao cliente`);
    assert.deepEqual(vazamentos(texto), [], `${caso}: ${texto}`);
  }
});

test("O2d copiar o type do body-parser nao basta para ganhar 400", async () => {
  // Um erro que NAO e SyntaxError, mas se diz "entity.parse.failed". O handler
  // exige os dois sinais; so o `type` nao e o caso reconhecido.
  const resposta = await fetch(`${erros.baseUrl}/tipo-forjado`);
  const texto = await resposta.text();
  assert.equal(resposta.status, 500, `o type forjado escolheu o status ${resposta.status}`);
  assert.equal(texto.includes(ISCA_DE_BIBLIOTECA), false);
});

// ---------------------------------------------------------------------------
// O2e - corpo grande demais responde 413 (para a v0.8.0)
// ---------------------------------------------------------------------------

test("O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor", async () => {
  // O limite do express.json() e 64 kB. Ate a v0.7.6 isto respondia 500.
  const contar = () => (app.lerStderr().match(/\[erro interno\]/g) || []).length;
  const antes = contar();

  const { resposta, texto } = await postarCorpo(
    app.baseUrl,
    "/api/auth/login",
    JSON.stringify({ identifier: "x".repeat(70 * 1024) }),
  );
  assert.equal(resposta.status, 413, `corpo grande respondeu ${resposta.status}`);
  const corpo = JSON.parse(texto);
  assert.deepEqual(corpo.error, { code: "PAYLOAD_TOO_LARGE", message: "O corpo da requisição é grande demais." });
  assert.doesNotMatch(texto, /request entity too large|limit/i);
  assert.deepEqual(vazamentos(texto), []);

  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(contar(), antes, "corpo grande foi registrado como erro interno");
});

test("O2e copiar name, type e status do corpo grande nao basta para ganhar 413", async () => {
  // Erro de classe Error que imita o PayloadTooLargeError campo a campo.
  const resposta = await fetch(`${erros.baseUrl}/tipo-413-forjado`);
  const texto = await resposta.text();
  assert.equal(resposta.status, 500, `o erro forjado escolheu o status ${resposta.status}`);
  assert.equal(texto.includes(ISCA_DE_BIBLIOTECA), false);
});

test("O2d o app de erros forjados e o handler real, e o parse de verdade continua 400", async () => {
  // O par negativo dos testes acima: o mesmo app, com o mesmo handler, ainda
  // reconhece a falha de parse real. Sem isto, um handler que devolvesse 500
  // para tudo passaria no O2d.
  const { resposta, texto } = await postarCorpo(erros.baseUrl, "/eco", "{nao-e-json");
  assert.equal(resposta.status, 400);
  assert.equal(JSON.parse(texto).error.code, "INVALID_JSON");
  assert.ok(Object.keys(ERROS_FORJADOS).length >= 7, "os casos forjados sumiram do ajudante");
});
