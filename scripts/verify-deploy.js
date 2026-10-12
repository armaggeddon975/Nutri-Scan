#!/usr/bin/env node
// verify:deploy - prova que o que esta NO AR corresponde ao que foi auditado.
//
// POR QUE ESTE COMANDO EXISTE
//
// Tudo o que `verify:release` e `verify:e2e` provam vale para o backend LOCAL.
// Ate a v0.7.4 nao havia nenhuma evidencia automatizada de que o deploy
// publicado era o codigo auditado - e o projeto ja publicou as cegas uma vez:
// o achado R3 da v0.6.9 registrou commits no ar sob o numero 0.6.8, com
// `/api/health` anunciando uma versao que nao correspondia ao que rodava.
//
// O subgate D1 e esse achado virando gate: versao no ar diferente da do
// repositorio e FALHA, nao aviso.
//
// SOMENTE LEITURA
//
// Este comando nao cria conta, nao grava historico, nao chama a Anthropic e nao
// escreve no banco. Toda requisicao e GET, com UMA excecao, declarada: o D6
// manda um POST com JSON quebrado para um caminho que NAO EXISTE
// (`SONDA_INEXISTENTE`). O corpo e recusado pelo parser antes de chegar a
// qualquer rota - e nao ha rota ali para chegar. E a forma de provocar um erro,
// e conferir que a resposta dele nao vaza nada, sem tocar em nada que persista.
// Ate a v0.7.5 esse erro saia como 500; desde a v0.7.6, ele e 400
// `INVALID_JSON`. O D6 aceita os dois, porque o que ele vigia e o vazamento.
//
// O teste `P13` grava cada requisicao que este comando faz e exige que nenhuma
// seja de escrita.
//
// USO
//   npm run verify:deploy -- https://nutriscan-h1wp.onrender.com
//   DEPLOY_URL=https://... npm run verify:deploy
//
// Sem URL, FALHA. Nunca assume localhost: um "PASS" contra a maquina local seria
// prova sobre outra coisa.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compararVersoes, normalizarBase } from "./version-check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// O free tier do Render adormece o servico; a primeira requisicao pode levar
// quase um minuto so para acordar.
const TIMEOUT_PADRAO_MS = 60000;

// Caminho reservado, que nao corresponde a nenhuma rota. D4 e D6 usam este
// prefixo para que nenhuma sonda caia, por acidente, numa rota de verdade.
export const SONDA_INEXISTENTE = "/api/__verify_deploy_inexistente";

export const PASS = "PASS";
export const FAIL = "FAIL";
export const NOT_EXECUTED = "NOT_EXECUTED";

// Assinaturas de vazamento numa resposta de erro. Cada uma ensina a um atacante
// algo sobre o servidor por dentro.
const VAZAMENTOS = [
  ["stack trace", /\n\s*at [^\n]*(\.m?js|\.cjs|\.ts|node:internal)/],
  ["stack trace", /"stack"\s*:/],
  ["caminho Windows", /[A-Za-z]:\\\\/],
  ["caminho de arquivo", /\/(home|usr|var|opt|app|srv|workspace|src)\/[^\s"]*\.(m?js|cjs|ts|json)/],
  ["node_modules", /node_modules/],
  ["SQL", /\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(FROM|INTO|SET|WHERE)\b/i],
  ["mensagem do PostgreSQL", /relation "|syntax error at or near|duplicate key value|violates (unique|foreign key|not-null)/i],
  [
    "nome de tabela",
    /\b(product_history|product_favorites|schema_migrations|password_hash|token_hash|password_salt)\b/,
  ],
  ["detalhe de driver", /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|SequelizeError|PostgresError|pg_hba)\b/],
];

// Chave ou credencial que nunca pode estar no HTML nem num bundle servido.
const SEGREDOS = [
  ["chave da Anthropic", /sk-ant-[A-Za-z0-9_-]{16,}/],
  ["chave estilo OpenAI", /sk-(proj|svcacct|admin|live|test)-[A-Za-z0-9_-]{16,}/],
  ["nome da variavel ANTHROPIC_API_KEY", /ANTHROPIC_API_KEY/],
  ["string de conexao com senha", /postgres(ql)?:\/\/[^\s"'@/]+:[^\s"'@/]+@/i],
  ["senha do Neon", /npg_[A-Za-z0-9]{10,}/],
  ["host de banco do Neon", /\.neon\.tech\b/i],
];

function encontrar(texto, padroes) {
  return padroes.filter(([, regex]) => regex.test(texto)).map(([rotulo]) => rotulo);
}

// Toda requisicao passa por aqui, e fica registrada. E o registro que o teste
// P13 usa para provar que nenhuma rota de escrita foi chamada.
function criarCliente(base, { fetchImpl, timeoutMs, registro }) {
  async function requisitar(caminho, opcoes = {}) {
    const metodo = (opcoes.method || "GET").toUpperCase();
    registro.push({ metodo, caminho });

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const resposta = await fetchImpl(new URL(caminho, base), {
        ...opcoes,
        method: metodo,
        signal: controle.signal,
      });
      const texto = await resposta.text();
      return { resposta, texto };
    } finally {
      clearTimeout(relogio);
    }
  }

  return { requisitar };
}

function resultado(id, descricao, estado, detalhe) {
  return { id, descricao, estado, detalhe };
}

// ---------------------------------------------------------------------------
// Os oito subgates
// ---------------------------------------------------------------------------

async function d1Versao(cliente, { versaoLocal }) {
  const { resposta, texto } = await cliente.requisitar("/api/health");
  if (resposta.status !== 200) {
    return [FAIL, `/api/health respondeu HTTP ${resposta.status}`];
  }
  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return [FAIL, "/api/health nao devolveu JSON"];
  }
  // A comparacao e a de `version-check.js`: igualdade estrita, nunca `includes`
  // nem prefixo. "0.7.50" nao e "0.7.5".
  const comparacao = compararVersoes(versaoLocal, corpo?.version);
  return [comparacao.ok ? PASS : FAIL, comparacao.motivo];
}

async function d2Https(cliente, { base, fetchImpl, timeoutMs }) {
  const alvo = new URL(base);
  if (alvo.protocol !== "https:") {
    return [FAIL, `o alvo foi informado como ${alvo.protocol}// - o deploy precisa responder por HTTPS`];
  }

  const { resposta } = await cliente.requisitar("/api/health");
  if (resposta.status !== 200) {
    return [FAIL, `HTTPS respondeu HTTP ${resposta.status}`];
  }

  // O mesmo host por http:// precisa REDIRECIONAR para https://. Servir por
  // http sem redirecionar deixaria o primeiro acesso - antes do HSTS - aberto.
  const inseguro = new URL(base);
  inseguro.protocol = "http:";
  const registroHttp = { metodo: "GET", caminho: `http://${inseguro.host}/api/health` };
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeoutMs);
  try {
    // Registrado a mao porque sai do cliente: a origem e outra.
    cliente.registrarExterno?.(registroHttp);
    const r = await fetchImpl(new URL("/api/health", inseguro), {
      method: "GET",
      redirect: "manual",
      signal: controle.signal,
    });
    const destino = r.headers.get("location") || "";
    if (r.status >= 300 && r.status < 400 && destino.startsWith("https://")) {
      return [PASS, `HTTPS responde, e http:// redireciona (${r.status}) para https://`];
    }
    return [FAIL, `http:// respondeu ${r.status} sem redirecionar para https://`];
  } catch (erro) {
    return [FAIL, `http:// nao pode ser consultado: ${erro.message}`];
  } finally {
    clearTimeout(relogio);
  }
}

async function d3Cabecalhos(cliente) {
  const { resposta } = await cliente.requisitar("/api/health");
  const faltas = [];

  const hsts = resposta.headers.get("strict-transport-security") || "";
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] || 0);
  if (maxAge < 15552000) faltas.push(`strict-transport-security (max-age ${maxAge || "ausente"})`);

  if (!resposta.headers.get("content-security-policy")) faltas.push("content-security-policy");
  if ((resposta.headers.get("x-content-type-options") || "").toLowerCase() !== "nosniff") {
    faltas.push("x-content-type-options: nosniff");
  }

  return faltas.length
    ? [FAIL, `ausente ou fraco: ${faltas.join(", ")}`]
    : [PASS, `HSTS max-age=${maxAge}, CSP e nosniff presentes`];
}

async function d4Api404(cliente) {
  const { resposta, texto } = await cliente.requisitar(SONDA_INEXISTENTE);
  const tipo = resposta.headers.get("content-type") || "";
  if (resposta.status !== 404) return [FAIL, `rota inexistente respondeu ${resposta.status}`];
  if (!/application\/json/.test(tipo)) return [FAIL, `rota inexistente respondeu ${tipo}, nao JSON`];
  if (/<!doctype html/i.test(texto)) return [FAIL, "rota de API inexistente devolveu o index.html"];
  return [PASS, "404 de API, em JSON"];
}

async function d5Autenticacao(cliente) {
  for (const caminho of ["/api/auth/me", "/api/history", "/api/favorites", "/api/profile"]) {
    const { resposta } = await cliente.requisitar(caminho);
    if (resposta.status !== 401) return [FAIL, `${caminho} sem sessao respondeu ${resposta.status}`];
  }
  return [PASS, "4 rotas autenticadas recusam sem sessao com 401"];
}

async function d6Vazamento(cliente) {
  const { resposta, texto } = await cliente.requisitar(SONDA_INEXISTENTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ isto nao e json",
  });
  if (resposta.status < 400) return [FAIL, `JSON quebrado foi aceito com ${resposta.status}`];
  const vazados = encontrar(texto, VAZAMENTOS);
  return vazados.length
    ? [FAIL, `a resposta de erro vaza: ${[...new Set(vazados)].join(", ")}`]
    : [PASS, `erro provocado (HTTP ${resposta.status}) sem stack, SQL, tabela nem caminho`];
}

function extrairAssets(html) {
  const assets = new Set();
  for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) assets.add(m[1]);
  for (const m of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)) {
    assets.add(m[1]);
  }
  for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']stylesheet["']/gi)) {
    assets.add(m[1]);
  }
  // So assets da propria origem: o que vem de CDN de terceiro nao e nosso bundle.
  return [...assets].filter((src) => src.startsWith("/") && !src.startsWith("//"));
}

async function d7Frontend(cliente, contexto) {
  const { resposta, texto } = await cliente.requisitar("/");
  const tipo = resposta.headers.get("content-type") || "";
  if (resposta.status !== 200 || !/text\/html/.test(tipo)) {
    return [FAIL, `"/" respondeu ${resposta.status} ${tipo}`];
  }

  const assets = extrairAssets(texto);
  const scripts = assets.filter((a) => /\.m?js(\?|$)/.test(a));
  if (scripts.length === 0) return [FAIL, "o HTML nao referencia nenhum script do app"];

  contexto.paginas = [{ caminho: "/", texto }];
  for (const asset of assets) {
    const r = await cliente.requisitar(asset);
    if (r.resposta.status !== 200) return [FAIL, `${asset} respondeu ${r.resposta.status}`];
    contexto.paginas.push({ caminho: asset, texto: r.texto });
  }
  return [PASS, `HTML e ${assets.length} asset(s) servidos (${scripts.length} script(s))`];
}

async function d8Segredos(_cliente, contexto) {
  // Depende do que D7 baixou. Sem D7, nao ha o que inspecionar - e isso e
  // NOT_EXECUTED, nunca PASS: nao olhar nao prova ausencia.
  if (!contexto.paginas?.length) {
    return [NOT_EXECUTED, "D7 nao obteve o HTML e os bundles; nada foi inspecionado"];
  }
  const achados = [];
  for (const { caminho, texto } of contexto.paginas) {
    for (const rotulo of encontrar(texto, SEGREDOS)) achados.push(`${rotulo} em ${caminho}`);
  }
  return achados.length
    ? [FAIL, achados.join("; ")]
    : [PASS, `${contexto.paginas.length} arquivo(s) inspecionado(s), nenhum segredo`];
}

export const SUBGATES = [
  ["D1", "versao no ar igual a do repositorio", d1Versao],
  ["D2", "resposta por HTTPS, e http:// redireciona", d2Https],
  ["D3", "cabecalhos de seguranca (HSTS, CSP, nosniff)", d3Cabecalhos],
  ["D4", "rota /api inexistente da 404 de API, nao index.html", d4Api404],
  ["D5", "rota autenticada sem sessao da 401", d5Autenticacao],
  ["D6", "erro provocado nao vaza stack, SQL nem caminho", d6Vazamento],
  ["D7", "o frontend e servido e carrega", d7Frontend],
  ["D8", "nenhuma chave no HTML nem nos bundles", d8Segredos],
];

/**
 * A regra do agregado: os oito subgates sao obrigatorios, e so PASS aprova.
 * NOT_EXECUTED nao conta como PASS.
 *
 * Fica separada para ser testada sozinha. No fluxo real, D8 so sai como
 * NOT_EXECUTED quando D7 ja falhou - e esse FAIL reprovaria o agregado de
 * qualquer jeito, escondendo uma regra frouxa aqui. A mutacao T8 mostrou isso.
 */
export function agregar(resultados) {
  return resultados.length === SUBGATES.length && resultados.every((r) => r.estado === PASS);
}

export async function lerVersaoLocal() {
  const pacote = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  return pacote.version;
}

/**
 * Roda os oito subgates contra `base`. Nunca lanca: cada subgate que quebra
 * vira FAIL com o motivo. Devolve tambem o registro de requisicoes.
 */
export async function verificarDeploy({
  base,
  versaoLocal,
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_PADRAO_MS,
} = {}) {
  const registro = [];
  const cliente = criarCliente(base, { fetchImpl, timeoutMs, registro });
  cliente.registrarExterno = (entrada) => registro.push(entrada);

  // Um contexto SO, compartilhado entre os subgates: D8 inspeciona o que D7
  // baixou. Passar uma copia a cada subgate faria D8 nunca ver as paginas e
  // sair sempre como NOT_EXECUTED.
  const contexto = { base, versaoLocal, fetchImpl, timeoutMs };
  const resultados = [];

  for (const [id, descricao, executar] of SUBGATES) {
    try {
      const [estado, detalhe] = await executar(cliente, contexto);
      resultados.push(resultado(id, descricao, estado, detalhe));
    } catch (erro) {
      // Nao conseguir consultar e FAIL. Um subgate que nao rodou nunca e PASS.
      resultados.push(resultado(id, descricao, FAIL, `nao foi possivel consultar: ${erro.message}`));
    }
  }

  return { resultados, aprovado: agregar(resultados), requisicoes: registro };
}

function imprimir({ base, versaoLocal, resultados, aprovado }) {
  console.log(`verify:deploy - alvo ${base}`);
  console.log(`versao do repositorio: ${versaoLocal}`);
  console.log("");
  for (const r of resultados) {
    console.log(`[${r.estado.padEnd(12)}] ${r.id}  ${r.descricao}`);
    console.log(`                ${r.detalhe}`);
  }
  console.log("");
  const contagem = (estado) => resultados.filter((r) => r.estado === estado).length;
  console.log(
    `PASS ${contagem(PASS)} | FAIL ${contagem(FAIL)} | NOT_EXECUTED ${contagem(NOT_EXECUTED)}`,
  );
  console.log(aprovado ? "[PASS] verify:deploy" : "[FAIL] verify:deploy");
}

async function main() {
  const entrada = process.argv[2] || process.env.DEPLOY_URL;
  const base = normalizarBase(entrada);

  if (!base) {
    console.error("[FAIL] verify:deploy - nenhuma URL de deploy informada.");
    console.error("");
    console.error("Informe a URL publicada, por argumento ou variavel:");
    console.error("  npm run verify:deploy -- https://seu-servico.onrender.com");
    console.error("  DEPLOY_URL=https://seu-servico.onrender.com npm run verify:deploy");
    console.error("");
    console.error("Este comando nunca assume localhost: provar o backend local aqui");
    console.error("seria provar outra coisa. Para o backend local, use verify:e2e.");
    process.exitCode = 1;
    return;
  }

  const timeoutMs = Number.parseInt(process.env.DEPLOY_TIMEOUT_MS || "", 10) || TIMEOUT_PADRAO_MS;
  const versaoLocal = await lerVersaoLocal();
  const saida = await verificarDeploy({ base, versaoLocal, timeoutMs });
  imprimir({ base, versaoLocal, ...saida });
  process.exitCode = saida.aprovado ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((erro) => {
    console.error(`[FAIL] verify:deploy - ${erro.message}`);
    process.exitCode = 1;
  });
}
