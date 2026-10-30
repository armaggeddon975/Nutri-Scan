import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

import { IDBFactory } from "fake-indexeddb";

import { createApp } from "../src/app.js";
import { answerAssistantChat } from "../src/ai/assistantService.js";
import { buildAssistantContext } from "../src/ai/contextBuilder.js";
import { criarLimitadoresDeComparacao, TETO_COMPARACAO_POR_IP, TETO_COMPARACAO_POR_USUARIO } from "../src/middleware/rateLimit.js";
import { amarrarExplicacoes } from "../src/services/comparisonService.js";
import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";
import { VALID_ALLERGY_IDS } from "../../shared/allergens.js";
import { validarCodigoDeBarras } from "../../shared/barcode.js";
import { compareProducts } from "../../shared/productComparison.js";
import { criarCacheOffline } from "../../src/services/offlineCache.js";
import { avaliarNoAparelho, consultarNoAparelho, guardarProdutoVisto, NO_APARELHO } from "../../src/services/offlineLookup.js";
import { aoConfirmarConta, aoExcluirConta, aoPerderSessao, aoSairDaConta } from "../../src/services/offlineSession.js";
import { limparCacheStorage } from "../../src/sw/limpezaDoCacheStorage.js";
import { listarArquivos, listasDoShell, montarServiceWorker, PUBLICO_PRE_CARREGADO } from "../../src/sw/montarServiceWorker.js";
import {
  DO_SHELL,
  IGNORAR,
  NAVEGACAO,
  PREFIXO_DO_CACHE,
  entradaLegitimaDoShell,
  estrategiaPara,
  nomeDoCache,
  podeGuardar,
} from "../../src/sw/politicaDeCache.js";
import { CAMINHO_DO_SERVICE_WORKER, ESCOPO_DO_SERVICE_WORKER, INTERVALO_DE_CONFERENCIA_MS, criarServiceWorkerDoApp } from "../../src/sw/registro.js";
import {
  arquivosDaPasta,
  carregarServiceWorker,
  criarCacheStorage,
  criarRede,
} from "./helpers/ambienteDoServiceWorker.js";

// v0.13.0 - app instalavel e service worker.
//
// COMO ESTES TESTES EXERCITAM A LOGICA REAL. O app e construido de verdade com
// o Vite (a mesma `vite.config.js`, o mesmo plugin) numa pasta temporaria. O
// `sw.js` que esse build gera - com a politica de `src/sw/politicaDeCache.js`
// dentro - roda num contexto proprio (`helpers/ambienteDoServiceWorker.js`) e
// recebe os eventos que o navegador manda: install, activate, fetch, message.
// O Cache Storage do teste SO GUARDA, com o corpo inteiro; quem decide o que
// entra e o service worker. A rede devolve os arquivos do build e respostas de
// API com dado de usuario, Set-Cookie e veredito PLANTADOS - e o teste procura
// esse dado nas chaves e nos corpos de tudo o que ficou guardado.
//
// O que NAO e provado aqui: o Cache Storage e o ciclo de vida do service
// worker do navegador de verdade. Isso foi conferido no Chromium, sobre o build
// real (AUDIT_REPORT), e o que nao pode ser feito neste ambiente - instalar num
// celular, HTTPS real - fica NAO COMPROVADO.

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const fonte = (relativo) => readFileSync(path.join(rootDir, relativo), "utf8");
const PACOTE = JSON.parse(fonte("package.json"));
const ORIGEM = "https://app.nutriscan.test";

// ---------------------------------------------------------------------------
// O build de verdade
// ---------------------------------------------------------------------------

// Feito ANTES de declarar os testes (top-level await): o `skip` de cada teste e
// avaliado na declaracao. Sem o Vite, os testes que dependem do build saem como
// NAO EXECUTADO - nunca como PASS.
async function construirApp() {
  let vite;
  try {
    vite = await import("vite");
  } catch {
    return null;
  }
  const pasta = mkdtempSync(path.join(tmpdir(), "nutriscan-sw-build-"));
  await vite.build({
    root: rootDir,
    configFile: path.join(rootDir, "vite.config.js"),
    logLevel: "silent",
    build: { outDir: pasta, emptyOutDir: true },
  });
  const arquivos = listarArquivos(pasta);
  const { shell, precache } = listasDoShell(arquivos);
  return {
    pasta,
    arquivos,
    shell,
    precache,
    sw: readFileSync(path.join(pasta, "sw.js"), "utf8"),
    html: readFileSync(path.join(pasta, "index.html"), "utf8"),
  };
}

const construido = await construirApp();

after(() => {
  if (construido) rmSync(construido.pasta, { recursive: true, force: true });
});

const precisaDoBuild = () => (construido ? false : "NAO EXECUTADO - vite ausente: o build nao foi gerado");

// ---------------------------------------------------------------------------
// A pessoa e o que a API devolve para ela - tudo plantado para ser procurado
// ---------------------------------------------------------------------------

const NOME = "Usuaria Isca Do Cache";
const EMAIL = "isca-cache@example.test";
const ALERGIA = "milk";
const PERFIL_JSON = `"allergies":["${ALERGIA}"]`;
const ISCA_DO_VEREDITO = "ISCA-DO-VEREDITO: este produto tem Leite/lactose";
const ISCA_DE_SESSAO = "ISCA-DE-SESSAO-0130";
const MARCAS_DE_USUARIO = [NOME, EMAIL, PERFIL_JSON, ISCA_DO_VEREDITO, ISCA_DE_SESSAO, '"allergyVerdict"', '"minimumSafety"'];

const usuario = { id: "conta-isca", name: NOME, email: EMAIL, allergies: [ALERGIA], alertLevels: { [ALERGIA]: "strict" } };
const veredito = { status: "conflict", reason: null, conflicts: [{ id: ALERGIA, label: "Leite/lactose" }], alert: ISCA_DO_VEREDITO, minimumSafety: "urgent" };

function json(corpo, extras = {}) {
  return () => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json; charset=utf-8", ...extras } });
}

const API = {
  "/api/auth/login": json({ user: usuario }, { "set-cookie": `nutriscan_session=${ISCA_DE_SESSAO}; HttpOnly; Path=/` }),
  "/api/auth/register": json({ user: usuario }, { "set-cookie": `nutriscan_session=${ISCA_DE_SESSAO}; HttpOnly; Path=/` }),
  "/api/auth/me": json({ user: usuario }),
  "/api/profile": json({ allergies: [ALERGIA], alertLevels: usuario.alertLevels }),
  "/api/profile/allergies": json({ user: usuario }),
  "/api/history": json({ items: [{ productCode: "7891000100103", productName: "Leite em po", userName: NOME }] }),
  "/api/favorites": json({ items: [{ productCode: "7891000100103", productName: "Leite em po", userName: NOME }] }),
  "/api/compare": json({ comparison: { products: [{ code: "7891000100103", allergyVerdict: veredito }] } }),
  "/api/compare/explain": json({ products: [{ code: "7891000100103", allergyVerdict: veredito }] }),
  "/api/assistant/chat": json({ answer: "x", allergyVerdict: veredito, safety: "urgent" }),
  "/api/account/export": json(
    { conta: { nome: NOME, email: EMAIL }, alergias: [ALERGIA], historico: [], favoritos: [] },
    { "content-disposition": 'attachment; filename="nutriscan-meus-dados-2026-10-30.json"', "cache-control": "no-store" },
  ),
  "/api/health": json({ status: "ok", version: PACOTE.version }),
};

// Navegar autenticado: o que o app pede ao servidor da entrada ate a comparacao.
const NAVEGACAO_AUTENTICADA = [
  ["POST", "/api/auth/login", JSON.stringify({ email: EMAIL, password: "x" })],
  ["GET", "/api/auth/me"],
  ["GET", "/api/profile"],
  ["PUT", "/api/profile/allergies", JSON.stringify({ allergies: [ALERGIA] })],
  ["GET", "/api/history"],
  ["POST", "/api/history", JSON.stringify({ productCode: "7891000100103" })],
  ["GET", "/api/favorites"],
  ["POST", "/api/favorites", JSON.stringify({ productCode: "7891000100103" })],
  ["POST", "/api/compare", JSON.stringify({ products: [] })],
  ["POST", "/api/compare/explain", JSON.stringify({ products: [] })],
  ["POST", "/api/assistant/chat", JSON.stringify({ message: "Posso?" })],
  ["GET", "/api/account/export"],
  ["GET", "/api/health"],
];

function montarAmbiente({ codigo = construido?.sw, arquivos = arquivosDaPasta(construido.pasta), cacheStorage = criarCacheStorage() } = {}) {
  const { rede, estado } = criarRede({ arquivos, api: API });
  const sw = carregarServiceWorker(codigo, { origem: ORIGEM, cacheStorage, rede });
  return { sw, rede, estado, cacheStorage };
}

async function swAtivo(opcoes) {
  const ambiente = montarAmbiente(opcoes);
  await ambiente.sw.instalar();
  await ambiente.sw.ativar();
  return ambiente;
}

function extrairAssets(html) {
  const assets = new Set();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(\/[^"]+)"/g)) assets.add(m[1]);
  return [...assets];
}

// Todo corpo guardado tem de ser IDENTICO, byte a byte, a um arquivo do build.
// O build nao tem dado de ninguem: um corpo identico a ele nao pode ter.
function conferirSoBuild(cacheStorage) {
  const { registros } = cacheStorage.inspecionar();
  for (const registro of registros) {
    const caminho = new URL(registro.url).pathname;
    const doBuild = arquivosDaPasta(construido.pasta)(caminho);
    assert.ok(doBuild, `guardado algo que nao e arquivo do build: ${registro.url}`);
    assert.equal(Buffer.compare(Buffer.from(registro.corpo), doBuild), 0, `${caminho} difere do arquivo do build`);
  }
  return registros;
}

function procurarDadoDeUsuario(cacheStorage) {
  const { nomes, registros } = cacheStorage.inspecionar();
  const achados = [];
  for (const nome of nomes) for (const marca of MARCAS_DE_USUARIO) if (nome.includes(marca)) achados.push(`nome de cache: ${marca}`);
  for (const registro of registros) {
    const textoDaChave = `${registro.url} ${JSON.stringify(registro.headers)}`;
    for (const marca of MARCAS_DE_USUARIO) {
      if (textoDaChave.includes(marca)) achados.push(`chave ${registro.url}: ${marca}`);
      if (registro.texto.includes(marca)) achados.push(`corpo ${registro.url}: ${marca}`);
    }
    if (/\/api(\/|$)/i.test(new URL(registro.url).pathname)) achados.push(`chave de API: ${registro.url}`);
    if (/set-cookie/i.test(JSON.stringify(registro.headers))) achados.push(`Set-Cookie guardado: ${registro.url}`);
  }
  return achados;
}

// ---------------------------------------------------------------------------
// P1 - o shell carrega sem rede
// ---------------------------------------------------------------------------

test("P1 sem rede, o HTML, o JavaScript e o CSS do app vem do cache", { skip: precisaDoBuild() }, async () => {
  const { sw, estado, cacheStorage } = await swAtivo();
  const { nomes, registros } = cacheStorage.inspecionar();
  assert.deepEqual(nomes, [nomeDoCache(PACOTE.version)]);
  assert.deepEqual(registros.map((r) => new URL(r.url).pathname).sort(), [...construido.precache].sort());

  estado.semRede = true;
  // A abertura do app: a navegacao para "/" e para qualquer rota do app.
  for (const rota of ["/", "/qualquer-rota"]) {
    const pagina = await sw.buscar(rota, { navegacao: true });
    assert.equal(pagina.interceptou, true);
    assert.equal(pagina.resposta.status, 200);
    assert.equal(await pagina.resposta.text(), construido.html, `${rota} sem rede nao abriu o shell`);
  }
  // Cada script e folha de estilo que o HTML pede, do cache e igual ao build.
  const assets = extrairAssets(construido.html).filter((a) => /\.(js|css)$/.test(a));
  assert.ok(assets.some((a) => a.endsWith(".js")) && assets.some((a) => a.endsWith(".css")), JSON.stringify(assets));
  for (const asset of assets) {
    const r = await sw.buscar(asset);
    assert.equal(r.interceptou, true, `${asset} nao passou pelo cache`);
    assert.equal(Buffer.compare(Buffer.from(await r.resposta.arrayBuffer()), arquivosDaPasta(construido.pasta)(asset)), 0);
  }
  // E os carregados sob demanda (o leitor de codigo de barras) tambem.
  for (const js of construido.precache.filter((c) => c.endsWith(".js"))) {
    const r = await sw.buscar(js);
    assert.equal(r.resposta.status, 200, `${js} sem rede`);
  }
});

test("P1 com rede, a pagina vem da rede - o shell guardado so entra sem ela", { skip: precisaDoBuild() }, async () => {
  const { sw, estado } = await swAtivo();
  estado.pedidos.length = 0;
  const pagina = await sw.buscar("/", { navegacao: true });
  assert.equal(pagina.resposta.status, 200);
  assert.ok(estado.pedidos.some((p) => new URL(p.url).pathname === "/"), "com rede, a pagina nao foi pedida a rede");
});

// ---------------------------------------------------------------------------
// P2 - sem rede, o app chega ao modo sem rede da v0.11.0
// ---------------------------------------------------------------------------

test("P2 sem rede: o shell abre e o produto guardado volta com o veredito refeito", { skip: precisaDoBuild() }, async () => {
  // Com rede: a pessoa abre o app e um produto (o IndexedDB da v0.11.0 guarda).
  const fabrica = new IDBFactory();
  const cache = criarCacheOffline({ indexedDB: fabrica, agora: () => Date.UTC(2026, 9, 30), alergiasValidas: VALID_ALLERGY_IDS });
  const conta = { id: "conta-p2", name: "P2", email: "p2@example.test", allergies: [ALERGIA], alertLevels: {} };
  await aoConfirmarConta(conta, { cache });
  await guardarProdutoVisto(conta.id, { code: "7891000100103", product_name: "Leite P2", ingredients_text: "leite integral" }, { cache });
  const { sw, estado } = await swAtivo();

  // Sem rede: o app abre pelo service worker...
  estado.semRede = true;
  const pagina = await sw.buscar("/", { navegacao: true });
  assert.equal(await pagina.resposta.text(), construido.html);
  // ...a API falha, como sem service worker...
  assert.equal((await sw.buscar("/api/auth/me")).interceptou, false);
  // ...e o caminho da v0.11.0 devolve o produto, com o veredito refeito agora.
  const lido = await consultarNoAparelho("7891000100103", { dono: conta.id, cache });
  assert.equal(lido.estado, NO_APARELHO);
  assert.equal(avaliarNoAparelho(lido.produto, { profileAllergies: [ALERGIA] }).allergyVerdict.status, "conflict");
  // O fim a fim no navegador - abrir sem rede, digitar o codigo, ver o
  // veredito - foi conferido no Chromium (AUDIT_REPORT).
});

// ---------------------------------------------------------------------------
// P3 - nenhuma resposta de /api/ autenticada no Cache Storage
// ---------------------------------------------------------------------------

const ROTAS_AUTENTICADAS = [
  "/api/auth/me",
  "/api/profile",
  "/api/profile/allergies",
  "/api/history",
  "/api/favorites",
  "/api/compare",
  "/api/compare/explain",
  "/api/assistant/chat",
  "/api/account",
  "/api/account/export",
  "/API/PROFILE",
  "/api/history?page=2",
];

test("P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada", { skip: precisaDoBuild() }, async () => {
  const contexto = { origem: ORIGEM, shell: construido.shell };
  for (const caminho of ROTAS_AUTENTICADAS) {
    const url = `${ORIGEM}${caminho}`;
    assert.equal(estrategiaPara({ method: "GET", url }, contexto), IGNORAR, `${caminho} seria interceptada`);
    assert.equal(estrategiaPara({ method: "GET", url, mode: "navigate" }, contexto), IGNORAR, `${caminho} como pagina`);
    // Mesmo que a lista do shell o incluisse por engano, a gravacao recusa.
    const ok = new Response('{"user":{}}', { status: 200, headers: { "content-type": "application/json" } });
    const comApiNoShell = { origem: ORIGEM, shell: [...construido.shell, new URL(url).pathname] };
    assert.equal(podeGuardar(new Request(url), ok, comApiNoShell), false, `${caminho} poderia ser gravada`);
  }
});

test("P3 navegando autenticado, nenhum Cache Storage guarda resposta de /api/ - chaves e corpos", { skip: precisaDoBuild() }, async () => {
  const { sw, rede, cacheStorage } = await swAtivo();
  for (const [metodo, caminho, corpo] of NAVEGACAO_AUTENTICADA) {
    const r = await sw.buscar(caminho, { metodo, corpo });
    assert.equal(r.interceptou, false, `${metodo} ${caminho} passou pelo service worker`);
    // A pagina faz a chamada direto na rede, e a resposta tem o dado de verdade.
    const resposta = await rede(new Request(`${ORIGEM}${caminho}`, { method: metodo, body: corpo }));
    assert.equal(resposta.status, 200);
  }
  // E a pessoa navega pelas telas: perfil, historico, favoritos, comparacao.
  for (const rota of ["/", "/#alergias", "/#historico", "/#favoritos", "/#comparar"]) {
    await sw.buscar(rota, { navegacao: true });
  }

  assert.deepEqual(procurarDadoDeUsuario(cacheStorage), []);
  const registros = conferirSoBuild(cacheStorage);
  // O id de alergia "milk" aparece no app como CATALOGO (o codigo que lista as
  // alergias), igual para todo mundo. Ele so pode estar em arquivo de codigo do
  // build - nunca num HTML, CSS, manifesto ou em JSON.
  for (const registro of registros) {
    if (registro.texto.includes(`"${ALERGIA}"`)) assert.match(registro.url, /\/assets\/[^/]+\.js$/, `${ALERGIA} fora do codigo: ${registro.url}`);
    assert.doesNotMatch(registro.headers["content-type"] || "", /^application\/json/, `JSON guardado: ${registro.url}`);
  }
});

// ---------------------------------------------------------------------------
// P4, P5, P6 - Set-Cookie, exportacao e veredito nunca guardados
// ---------------------------------------------------------------------------

test("P4 resposta com Set-Cookie nunca e guardada - nem de /api/, nem de arquivo do shell", { skip: precisaDoBuild() }, async () => {
  const contexto = { origem: ORIGEM, shell: construido.shell };
  const comCookie = (corpo = "x") => new Response(corpo, { status: 200, headers: { "content-type": "text/javascript", "set-cookie": "s=1" } });
  const arquivoDoShell = construido.precache.find((c) => c.endsWith(".js"));
  assert.equal(podeGuardar(new Request(`${ORIGEM}${arquivoDoShell}`), comCookie(), contexto), false);

  // O login devolve Set-Cookie: o service worker nem toca.
  const { sw, cacheStorage } = await swAtivo();
  assert.equal((await sw.buscar("/api/auth/login", { metodo: "POST", corpo: "{}" })).interceptou, false);

  // Um arquivo do shell que nao foi pre-carregado, servido COM Set-Cookie: a
  // pessoa recebe o arquivo, mas ele nao fica guardado.
  const foraDoPrecache = construido.shell.find((c) => !construido.precache.includes(c) && c.startsWith("/assets/"));
  assert.ok(foraDoPrecache, "o build nao tem arquivo fora do pre-carregamento para o teste");
  const arquivos = arquivosDaPasta(construido.pasta);
  const { rede } = criarRede({ arquivos, api: API });
  const redeComCookie = async (entrada, opcoes) => {
    const resposta = await rede(entrada, opcoes);
    if (new URL(entrada.url ?? entrada).pathname !== foraDoPrecache) return resposta;
    return new Response(await resposta.arrayBuffer(), { status: 200, headers: { "content-type": "font/woff", "set-cookie": "s=1" } });
  };
  const cacheStorage2 = criarCacheStorage();
  const sw2 = carregarServiceWorker(construido.sw, { origem: ORIGEM, cacheStorage: cacheStorage2, rede: redeComCookie });
  await sw2.instalar();
  await sw2.ativar();
  const r = await sw2.buscar(foraDoPrecache);
  assert.equal(r.resposta.status, 200);
  assert.equal(cacheStorage2.inspecionar().registros.some((x) => new URL(x.url).pathname === foraDoPrecache), false);

  // O index.html servido com Set-Cookie: a instalacao FALHA - nenhum shell com
  // cookie assume.
  const redeHtmlComCookie = async (entrada, opcoes) => {
    const resposta = await rede(entrada, opcoes);
    if (new URL(entrada.url ?? entrada).pathname !== "/index.html") return resposta;
    return new Response(await resposta.text(), { status: 200, headers: { "content-type": "text/html", "set-cookie": "s=1" } });
  };
  const cacheStorage3 = criarCacheStorage();
  const sw3 = carregarServiceWorker(construido.sw, { origem: ORIGEM, cacheStorage: cacheStorage3, rede: redeHtmlComCookie });
  await assert.rejects(sw3.instalar(), /shell incompleto: \/index\.html/);
  assert.equal(cacheStorage3.inspecionar().registros.some((x) => new URL(x.url).pathname === "/index.html"), false);
  assert.deepEqual(procurarDadoDeUsuario(cacheStorage), []);
});

test("P5 /api/account/export nunca e guardada, em nenhuma grafia", { skip: precisaDoBuild() }, async () => {
  const grafias = ["/api/account/export", "/API/ACCOUNT/EXPORT", "/Api/Account/Export", "/api/account/export?formato=json", "/api/account/export/"];
  // Cada grafia NA lista do shell: so a regra de /api/ pode barrar.
  const contexto = { origem: ORIGEM, shell: [...construido.shell, ...grafias.map((g) => g.split("?")[0])] };
  for (const caminho of grafias) {
    const url = `${ORIGEM}${caminho}`;
    assert.equal(estrategiaPara({ method: "GET", url }, contexto), IGNORAR);
    const exportacao = await API["/api/account/export"]();
    assert.equal(podeGuardar(new Request(url), exportacao, contexto), false);
  }
  const { sw, cacheStorage } = await swAtivo();
  assert.equal((await sw.buscar("/api/account/export")).interceptou, false);
  assert.equal(cacheStorage.inspecionar().registros.some((r) => /export/i.test(r.url) || r.texto.includes(EMAIL)), false);
});

test("P6 o veredito nao aparece em nenhum Cache Storage", { skip: precisaDoBuild() }, async () => {
  const { sw, rede, cacheStorage } = await swAtivo();
  // As rotas que carregam veredito: assistente e comparacao.
  for (const caminho of ["/api/assistant/chat", "/api/compare", "/api/compare/explain"]) {
    assert.equal((await sw.buscar(caminho, { metodo: "POST", corpo: "{}" })).interceptou, false);
    assert.equal((await sw.buscar(caminho)).interceptou, false);
    const resposta = await rede(new Request(`${ORIGEM}${caminho}`, { method: "POST", body: "{}" }));
    assert.match(await resposta.text(), /ISCA-DO-VEREDITO/, "a rede do teste nao devolveu o veredito");
  }
  const { registros } = cacheStorage.inspecionar();
  for (const registro of registros) {
    assert.equal(registro.texto.includes(ISCA_DO_VEREDITO), false, `veredito em ${registro.url}`);
    assert.equal(registro.texto.includes('"minimumSafety":'), false, `veredito serializado em ${registro.url}`);
  }
  conferirSoBuild(cacheStorage);
});

// ---------------------------------------------------------------------------
// P7, P8 - logout e exclusao limpam o Cache Storage E o IndexedDB
// ---------------------------------------------------------------------------

async function inspecionarIndexedDB(fabrica) {
  const textos = [];
  for (const { name } of await fabrica.databases()) {
    const banco = await new Promise((ok, erro) => {
      const pedido = fabrica.open(name);
      pedido.onsuccess = () => ok(pedido.result);
      pedido.onerror = () => erro(pedido.error);
    });
    for (const loja of banco.objectStoreNames) {
      const valores = await new Promise((ok) => {
        const pedido = banco.transaction(loja, "readonly").objectStore(loja).getAll();
        pedido.onsuccess = () => ok(pedido.result);
      });
      textos.push(JSON.stringify(valores));
    }
    banco.close();
  }
  return textos.join("\n");
}

// Um aparelho com a conta da pessoa nos DOIS armazenamentos: o IndexedDB da
// v0.11.0 com perfil e produto, e o Cache Storage com o shell e - plantado,
// como o resto de uma versao defeituosa - resposta de API com o dado dela.
async function aparelhoComConta() {
  const fabrica = new IDBFactory();
  const cache = criarCacheOffline({ indexedDB: fabrica, agora: () => Date.UTC(2026, 9, 30), alergiasValidas: VALID_ALLERGY_IDS });
  await aoConfirmarConta(usuario, { cache });
  await guardarProdutoVisto(usuario.id, { code: "7891000100103", product_name: "Leite Da Isca", ingredients_text: "leite" }, { cache });

  const cacheStorage = criarCacheStorage();
  const shell = nomeDoCache(PACOTE.version);
  await cacheStorage.plantar(shell, `${ORIGEM}/index.html`, "<!doctype html><title>NutriScan</title>", { "content-type": "text/html" });
  await cacheStorage.plantar(shell, `${ORIGEM}/assets/app-abc.js`, "console.log('app')", { "content-type": "text/javascript" });
  await cacheStorage.plantar(shell, `${ORIGEM}/api/profile`, JSON.stringify({ user: usuario }));
  await cacheStorage.plantar(shell, `${ORIGEM}/index.html?u=${usuario.id}`, NOME, { "content-type": "text/html" });
  await cacheStorage.plantar("dados-da-conta", `${ORIGEM}/api/history`, JSON.stringify({ items: [{ userName: NOME }] }));

  const antes = await inspecionarIndexedDB(fabrica);
  assert.match(antes, /Leite Da Isca/);
  assert.match(antes, new RegExp(ALERGIA));
  assert.ok(procurarDadoDeUsuario(cacheStorage).length > 0, "o teste nao plantou dado no Cache Storage");
  return { fabrica, cache, cacheStorage };
}

async function conferirAparelhoLimpo({ fabrica, cacheStorage }) {
  const depois = await inspecionarIndexedDB(fabrica);
  for (const vestigio of [usuario.id, NOME, "Leite Da Isca", `"${ALERGIA}"`, "strict"]) {
    assert.equal(depois.includes(vestigio), false, `IndexedDB: sobrou "${vestigio}"`);
  }
  assert.deepEqual(procurarDadoDeUsuario(cacheStorage), [], "Cache Storage com dado de quem saiu");
  const { nomes, registros } = cacheStorage.inspecionar();
  assert.deepEqual(nomes, [nomeDoCache(PACOTE.version)], "sobrou cache que nao e o do shell");
  // O shell fica: e o que abre o app sem rede para a proxima pessoa.
  assert.deepEqual(registros.map((r) => new URL(r.url).pathname).sort(), ["/assets/app-abc.js", "/index.html"]);
}

// A volta a visitante no App (restoreGuestSession) faz, nesta ordem: o
// aoPerderSessao da v0.11.0 e o limparCacheStorage da v0.13.0. O logout e a
// exclusao passam por ela.
function voltaAVisitanteDoApp() {
  const app = fonte("src/App.jsx");
  const inicio = app.indexOf("const restoreGuestSession = useCallback");
  return { app, bloco: app.slice(inicio, app.indexOf("}, []);", inicio)) };
}

test("P7 logout limpa o Cache Storage e o IndexedDB - os dois conferidos", async () => {
  const aparelho = await aparelhoComConta();
  // O que o App faz ao sair: aoSairDaConta, e a volta a visitante.
  await aoSairDaConta({ sair: async () => {}, cache: aparelho.cache });
  await aoPerderSessao({ cache: aparelho.cache });
  await limparCacheStorage({ cachesApi: aparelho.cacheStorage.api(ORIGEM), origem: ORIGEM });
  await conferirAparelhoLimpo(aparelho);

  // Mesmo sem resposta do servidor ao sair.
  const semServidor = await aparelhoComConta();
  await aoSairDaConta({ sair: async () => Promise.reject(Object.assign(new Error("sem rede"), { status: 0 })), cache: semServidor.cache });
  await aoPerderSessao({ cache: semServidor.cache });
  await limparCacheStorage({ cachesApi: semServidor.cacheStorage.api(ORIGEM), origem: ORIGEM });
  await conferirAparelhoLimpo(semServidor);

  // E o App chama as duas limpezas na volta a visitante, e o logout passa por ela.
  const { app, bloco } = voltaAVisitanteDoApp();
  assert.match(bloco, /aoPerderSessao\(\);[\s\S]*limparCacheStorage\(\);/, "a volta a visitante nao limpa o Cache Storage");
  const logout = app.slice(app.indexOf("const logout = async () => {"), app.indexOf("const exportarDados"));
  assert.match(logout, /await aoSairDaConta\(\{ sair: logoutAccount \}\);[\s\S]*restoreGuestSession\(/);
});

test("P8 exclusao de conta limpa o Cache Storage e o IndexedDB - so depois de o servidor confirmar", async () => {
  // Exclusao recusada: nada sai de nenhum dos dois.
  const recusada = await aparelhoComConta();
  await assert.rejects(
    aoExcluirConta("errada", { excluir: async () => Promise.reject(Object.assign(new Error("Senha incorreta."), { status: 401 })), cache: recusada.cache }),
  );
  assert.match(await inspecionarIndexedDB(recusada.fabrica), /Leite Da Isca/);

  const aparelho = await aparelhoComConta();
  await aoExcluirConta("certa", { excluir: async () => ({ ok: true }), cache: aparelho.cache });
  await aoPerderSessao({ cache: aparelho.cache });
  await limparCacheStorage({ cachesApi: aparelho.cacheStorage.api(ORIGEM), origem: ORIGEM });
  await conferirAparelhoLimpo(aparelho);

  const { app } = voltaAVisitanteDoApp();
  const exclusao = app.slice(app.indexOf("const excluirConta = async (senha) => {"));
  assert.match(exclusao, /await aoExcluirConta\(senha, \{ excluir: excluirMinhaConta \}\);[\s\S]*restoreGuestSession\("Sua conta foi excluída\."/);
});

test("P7 a limpeza tira o que nao e shell e deixa o shell, pela regra de politicaDeCache", async () => {
  const legitimas = ["/index.html", "/assets/index-abc.js", "/assets/x-latin-600-normal-a.woff2", "/icon-512.png", "/manifest.webmanifest", "/nutriscan-icon.svg"];
  const estranhas = ["/api/profile", "/API/history", "/index.html?u=1", "/assets/dados.json", "/perfil", "/historico.html"];
  for (const caminho of legitimas) assert.equal(entradaLegitimaDoShell(`${ORIGEM}${caminho}`, { origem: ORIGEM }), true, caminho);
  for (const caminho of estranhas) assert.equal(entradaLegitimaDoShell(`${ORIGEM}${caminho}`, { origem: ORIGEM }), false, caminho);
  assert.equal(entradaLegitimaDoShell("https://images.openfoodfacts.org/x.png", { origem: ORIGEM }), false);
  // Sem Cache Storage (navegador antigo): a limpeza nao quebra a saida.
  assert.deepEqual(await limparCacheStorage({ cachesApi: undefined, origem: ORIGEM }), { removidos: [], semCacheStorage: true });
});

// ---------------------------------------------------------------------------
// P9 - versao nova descarta o cache antigo e passa a ser servida
// ---------------------------------------------------------------------------

function buildSintetico(versao) {
  const arquivos = {
    "/index.html": `<!doctype html><title>NutriScan ${versao}</title><script type="module" src="/assets/app-${versao}.js"></script>`,
    [`/assets/app-${versao}.js`]: `console.log("app ${versao}")`,
  };
  for (const publico of PUBLICO_PRE_CARREGADO) arquivos[publico] = `${publico} ${versao}`;
  return arquivos;
}

test("P9 versao nova publicada: o cache antigo e descartado e a versao nova passa a ser servida", async () => {
  const cacheStorage = criarCacheStorage();
  const publicado = { versao: "0.13.0" };
  const arquivos = (caminho) => buildSintetico(publicado.versao)[caminho] ?? null;
  const montar = async (versao) => {
    const { shell, precache } = listasDoShell(Object.keys(buildSintetico(versao)));
    return montarServiceWorker({ versao, shell, precache });
  };

  // A versao 0.13.0 no ar, instalada e ativa.
  const { rede, estado } = criarRede({ arquivos, api: API });
  const antigo = carregarServiceWorker(await montar("0.13.0"), { origem: ORIGEM, cacheStorage, rede });
  await antigo.instalar();
  await antigo.ativar();
  assert.deepEqual(cacheStorage.inspecionar().nomes, ["nutriscan-shell-0.13.0"]);

  // Publicada a 0.13.1: a nova instala ao lado e, ao assumir, apaga a antiga.
  publicado.versao = "0.13.1";
  const novo = carregarServiceWorker(await montar("0.13.1"), { origem: ORIGEM, cacheStorage, rede });
  await novo.instalar();
  assert.deepEqual(cacheStorage.inspecionar().nomes.sort(), ["nutriscan-shell-0.13.0", "nutriscan-shell-0.13.1"]);
  await novo.ativar();
  const { nomes, registros } = cacheStorage.inspecionar();
  assert.deepEqual(nomes, ["nutriscan-shell-0.13.1"], "o cache da versao antiga ficou");
  assert.equal(registros.some((r) => r.url.includes("app-0.13.0")), false, "arquivo da versao antiga continua guardado");

  // Sem rede, quem abre e a versao nova.
  estado.semRede = true;
  const pagina = await novo.buscar("/", { navegacao: true });
  assert.match(await pagina.resposta.text(), /NutriScan 0\.13\.1/);
  assert.equal((await novo.buscar("/assets/app-0.13.1.js")).resposta.status, 200);
});

test("P9 a chave do cache e a versao do package.json - no build real", { skip: precisaDoBuild() }, async () => {
  assert.match(construido.sw, new RegExp(`NutriScan ${PACOTE.version.replace(/\./g, "\\.")} - service worker`));
  const { cacheStorage } = await swAtivo();
  assert.deepEqual(cacheStorage.inspecionar().nomes, [`${PREFIXO_DO_CACHE}${PACOTE.version}`]);
  assert.throws(() => nomeDoCache(""), /versao do app ausente/);
});

// ---------------------------------------------------------------------------
// P10, P11 - caminho para atualizar, e nunca recarregar sozinho
// ---------------------------------------------------------------------------

function alvoDeEventos() {
  const ouvintes = {};
  return {
    addEventListener(tipo, funcao) {
      (ouvintes[tipo] ||= []).push(funcao);
    },
    disparar(tipo, evento = {}) {
      for (const funcao of ouvintes[tipo] || []) funcao(evento);
    },
  };
}

function navegadorFalso({ controller = { estado: "ativo" }, waiting = null } = {}) {
  const mensagens = [];
  const registro = Object.assign(alvoDeEventos(), {
    waiting,
    installing: null,
    atualizacoes: 0,
    update: async () => {
      registro.atualizacoes += 1;
    },
  });
  const servico = Object.assign(alvoDeEventos(), {
    controller,
    register: async () => registro,
  });
  const recargas = { total: 0 };
  const documento = Object.assign(alvoDeEventos(), { visibilityState: "visible" });
  return {
    registro,
    servico,
    mensagens,
    recargas,
    documento,
    navegador: { serviceWorker: servico },
    janela: { isSecureContext: true, location: { reload: () => (recargas.total += 1) } },
  };
}

function workerFalso(mensagens) {
  return Object.assign(alvoDeEventos(), { state: "installing", postMessage: (m) => mensagens.push(m) });
}

test("P10 versao nova esperando: o app avisa, e o toque em Atualizar faz ela assumir", async () => {
  const falso = navegadorFalso();
  const esperando = workerFalso(falso.mensagens);
  falso.registro.waiting = esperando;
  const swDoApp = criarServiceWorkerDoApp({ navegador: () => falso.navegador, janela: () => falso.janela, documento: () => falso.documento });
  const avisos = [];
  swDoApp.aoTerVersaoNova((v) => avisos.push(v));
  assert.equal((await swDoApp.registrar()).estado, "registrado");
  assert.deepEqual(avisos, [true], "a versao esperando nao foi avisada");

  assert.equal(swDoApp.aplicarAtualizacao(), true);
  assert.deepEqual(falso.mensagens, [{ tipo: "ATUALIZAR" }]);
  // E o service worker REAL responde a essa mensagem assumindo.
  const { cacheStorage } = { cacheStorage: criarCacheStorage() };
  const { rede } = criarRede({ arquivos: () => null, api: API });
  const sw = carregarServiceWorker(await montarServiceWorker({ versao: "0.13.0", shell: [], precache: [] }), { origem: ORIGEM, cacheStorage, rede });
  await sw.mensagem({ tipo: "ATUALIZAR" });
  assert.equal(sw.registro.skipWaiting, 1);
  await sw.mensagem({ tipo: "OUTRA-COISA" });
  assert.equal(sw.registro.skipWaiting, 1, "mensagem estranha fez o service worker assumir");
});

test("P10 versao nova encontrada depois: o aviso aparece; com o app aberto por dias, ele confere de novo", async () => {
  const falso = navegadorFalso();
  const relogio = { agora: 0 };
  const swDoApp = criarServiceWorkerDoApp({
    navegador: () => falso.navegador,
    janela: () => falso.janela,
    documento: () => falso.documento,
    agora: () => relogio.agora,
  });
  const avisos = [];
  swDoApp.aoTerVersaoNova((v) => avisos.push(v));
  await swDoApp.registrar();
  assert.deepEqual(avisos, []);

  const novo = workerFalso(falso.mensagens);
  falso.registro.installing = novo;
  falso.registro.disparar("updatefound");
  novo.state = "installed";
  novo.disparar("statechange");
  assert.deepEqual(avisos, [true]);

  // Voltar para a tela antes de uma hora nao confere; depois, confere.
  falso.documento.disparar("visibilitychange");
  assert.equal(falso.registro.atualizacoes, 0);
  relogio.agora = INTERVALO_DE_CONFERENCIA_MS + 1;
  falso.documento.disparar("visibilitychange");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(falso.registro.atualizacoes, 1);
});

test("P10 o aviso de versao nova esta na tela, com o botao, e a regiao existe antes dele", { skip: precisaDoBuild() }, async () => {
  const tela = await renderizar();
  const vazio = tela.render(tela.h(tela.componentes.AvisoDeVersaoNova, { visivel: false, onAtualizar: () => {} }));
  assert.match(vazio, /role="status" aria-live="polite"/);
  const comVersao = tela.render(tela.h(tela.componentes.AvisoDeVersaoNova, { visivel: true, onAtualizar: () => {} }));
  assert.match(comVersao, /Há uma versão nova do NutriScan\./);
  assert.match(comVersao, /<button class="primary-button" type="button">Atualizar agora<\/button>/);
  // No app inteiro, a regiao ja esta no primeiro HTML.
  const app = tela.render(tela.h(tela.componentes.App));
  assert.match(app, /class="update-region" role="status" aria-live="polite"/);
});

test("P11 a pagina nunca recarrega sozinha: so pelo toque em Atualizar", async () => {
  const falso = navegadorFalso();
  const swDoApp = criarServiceWorkerDoApp({ navegador: () => falso.navegador, janela: () => falso.janela, documento: () => falso.documento });
  await swDoApp.registrar();
  // A primeira instalacao assumindo, ou outra aba atualizando: nao recarrega.
  falso.servico.disparar("controllerchange");
  assert.equal(falso.recargas.total, 0, "recarregou sem a pessoa pedir");
  // Sem versao esperando, o botao nao faz nada.
  assert.equal(swDoApp.aplicarAtualizacao(), false);
  falso.servico.disparar("controllerchange");
  assert.equal(falso.recargas.total, 0);

  // A pessoa toca em Atualizar: recarrega UMA vez, quando a nova assume.
  falso.registro.waiting = workerFalso(falso.mensagens);
  const swDoApp2 = criarServiceWorkerDoApp({ navegador: () => falso.navegador, janela: () => falso.janela, documento: () => falso.documento });
  await swDoApp2.registrar();
  swDoApp2.aplicarAtualizacao();
  falso.servico.disparar("controllerchange");
  falso.servico.disparar("controllerchange");
  assert.equal(falso.recargas.total, 1);
});

test("P11 a versao nova nunca assume sozinha na instalacao - espera", { skip: precisaDoBuild() }, async () => {
  const { sw } = montarAmbiente();
  await sw.instalar();
  assert.equal(sw.registro.skipWaiting, 0, "a instalacao chamou skipWaiting: a versao nova trocaria a pagina aberta");
  await sw.ativar();
  assert.equal(sw.registro.skipWaiting, 0);
  assert.equal(sw.registro.claim, 1, "na primeira instalacao a pagina aberta passa a ser controlada");
});

// ---------------------------------------------------------------------------
// P12, P13 - o app carrega sem service worker
// ---------------------------------------------------------------------------

async function rodarMain(navegador, janelaExtra = {}) {
  const { build } = await import("esbuild");
  const resultado = await build({
    entryPoints: [path.join(rootDir, "src/main.jsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl", ".jpg": "dataurl", ".woff": "empty", ".woff2": "empty" },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.PROD": "true" },
    plugins: [
      {
        // O createRoot de verdade precisa de um DOM; aqui ele so registra que o
        // app foi desenhado, e em que momento.
        name: "createRoot-registrado",
        setup(construtor) {
          construtor.onResolve({ filter: /^react-dom\/client$/ }, () => ({ path: "react-dom-client", namespace: "duble" }));
          construtor.onLoad({ filter: /.*/, namespace: "duble" }, () => ({
            contents: "export function createRoot(el) { return { render(no) { globalThis.__desenhos.push(el.id); } }; }",
            loader: "js",
          }));
        },
      },
    ],
    logLevel: "silent",
  });
  const rejeicoes = [];
  const aoRejeitar = (motivo) => rejeicoes.push(motivo);
  process.on("unhandledRejection", aoRejeitar);
  const contexto = {
    __desenhos: [],
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Promise,
    URL,
    TextEncoder,
    TextDecoder,
    document: { getElementById: (id) => ({ id }), addEventListener() {}, visibilityState: "visible" },
    navigator: navegador,
    window: { isSecureContext: true, addEventListener() {}, location: { reload() {} }, ...janelaExtra },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  contexto.globalThis = contexto;
  vm.createContext(contexto);
  vm.runInContext(resultado.outputFiles[0].text, contexto);
  // Desenho sincrono, antes de qualquer promessa do registro resolver.
  const desenhosAntes = [...contexto.__desenhos];
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
  process.off("unhandledRejection", aoRejeitar);
  return { desenhosAntes, desenhos: contexto.__desenhos, rejeicoes };
}

test("P12 com o registro do service worker falhando, o app carrega e funciona", async () => {
  // Recusado (sw.js fora do ar, CSP, escopo)...
  const recusado = await rodarMain({
    serviceWorker: { register: () => Promise.reject(new Error("registro recusado")), addEventListener() {}, controller: null },
  });
  assert.deepEqual(recusado.desenhosAntes, ["root"], "o app esperou o service worker para aparecer");
  assert.deepEqual(recusado.desenhos, ["root"]);
  assert.deepEqual(recusado.rejeicoes, [], "a falha do registro escapou como erro");

  // ...ou lancando na hora.
  const lancou = await rodarMain({
    serviceWorker: {
      register: () => {
        throw new Error("lancou");
      },
      addEventListener() {},
      controller: null,
    },
  });
  assert.deepEqual(lancou.desenhosAntes, ["root"]);
  assert.deepEqual(lancou.rejeicoes, []);

  // E o registro diz que falhou, sem lancar.
  const swDoApp = criarServiceWorkerDoApp({
    navegador: () => ({ serviceWorker: { register: () => Promise.reject(new Error("x")), addEventListener() {} } }),
    janela: () => ({ isSecureContext: true }),
    documento: () => null,
  });
  assert.equal((await swDoApp.registrar()).estado, "falhou");
});

test("P13 navegador sem service worker, ou fora de contexto seguro: o app carrega e funciona", async () => {
  const semSuporte = await rodarMain({});
  assert.deepEqual(semSuporte.desenhosAntes, ["root"]);
  assert.deepEqual(semSuporte.rejeicoes, []);

  const inseguro = await rodarMain(
    { serviceWorker: { register: () => assert.fail("registrou fora de contexto seguro"), addEventListener() {} } },
    { isSecureContext: false },
  );
  assert.deepEqual(inseguro.desenhosAntes, ["root"]);

  for (const [navegador, janela] of [
    [{}, { isSecureContext: true }],
    [{ serviceWorker: { register: () => assert.fail("nao devia registrar") } }, { isSecureContext: false }],
    [undefined, undefined],
  ]) {
    const swDoApp = criarServiceWorkerDoApp({ navegador: () => navegador, janela: () => janela, documento: () => null });
    assert.equal((await swDoApp.registrar()).estado, "sem-suporte");
  }
  // Em `npm run dev` nao registra.
  const dev = criarServiceWorkerDoApp({ navegador: () => assert.fail("consultou o navegador"), janela: () => null });
  assert.equal((await dev.registrar({ ativo: false })).estado, "desligado");
});

// ---------------------------------------------------------------------------
// P14, P15 - manifesto e icones
// ---------------------------------------------------------------------------

const MANIFESTO = JSON.parse(fonte("public/manifest.webmanifest"));

function dimensoesDoPng(buffer) {
  assert.equal(buffer.subarray(1, 4).toString("latin1"), "PNG", "nao e PNG");
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

test("P14 manifesto valido, com os campos decididos", () => {
  assert.equal(MANIFESTO.name, "NutriScan");
  assert.equal(MANIFESTO.short_name, "NutriScan");
  assert.equal(MANIFESTO.lang, "pt-BR");
  assert.equal(MANIFESTO.start_url, "/");
  assert.equal(MANIFESTO.scope, "/");
  assert.equal(MANIFESTO.id, "/");
  assert.equal(MANIFESTO.display, "standalone");
  assert.equal(MANIFESTO.orientation, "portrait");
  // As cores da identidade: o oliva da barra e o creme do fundo, os tokens do design.
  const css = fonte("src/styles.css");
  assert.match(css, new RegExp(`--chrome: ${MANIFESTO.theme_color};`));
  assert.match(css, new RegExp(`--bg: ${MANIFESTO.background_color};`));
  assert.match(fonte("index.html"), new RegExp(`<meta name="theme-color" content="${MANIFESTO.theme_color}" />`));
  assert.ok(MANIFESTO.description.length > 20);
  // O HTML aponta para ele, e para o icone do iPhone.
  assert.match(fonte("index.html"), /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
  assert.match(fonte("index.html"), /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
  // Instalavel: um icone de 192 e um de 512, e um maskable.
  const tamanhos = MANIFESTO.icons.map((i) => i.sizes);
  assert.ok(tamanhos.includes("192x192") && tamanhos.includes("512x512"));
  assert.ok(MANIFESTO.icons.some((i) => i.purpose === "maskable"));
});

test("P15 todo icone declarado existe no projeto, no tamanho declarado", () => {
  const declarados = [...MANIFESTO.icons.map((i) => ({ src: i.src, sizes: i.sizes, type: i.type })), { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }];
  for (const icone of declarados) {
    const arquivo = readFileSync(path.join(rootDir, "public", icone.src));
    if (icone.type === "image/png") assert.equal(dimensoesDoPng(arquivo), icone.sizes, icone.src);
    else assert.match(arquivo.toString("utf8"), /^<svg[\s\S]*<\/svg>\s*$/);
  }
  // E todos vao para o pre-carregamento: instalado e sem rede, o icone aparece.
  for (const icone of declarados) assert.ok(PUBLICO_PRE_CARREGADO.includes(icone.src), `${icone.src} fora do pre-carregamento`);
});

// ---------------------------------------------------------------------------
// P16 - escopo
// ---------------------------------------------------------------------------

test("P16 escopo '/': o service worker so intercepta a pagina e os arquivos do build", { skip: precisaDoBuild() }, async () => {
  assert.equal(CAMINHO_DO_SERVICE_WORKER, "/sw.js");
  assert.equal(ESCOPO_DO_SERVICE_WORKER, "/");
  const { sw } = await swAtivo();
  const naoIntercepta = [
    ["GET", "/api/health"],
    ["GET", "https://images.openfoodfacts.org/images/products/789/front.jpg"],
    ["GET", "https://world.openfoodfacts.org/api/v2/product/7891000100103.json"],
    // Outra origem com o MESMO caminho de um arquivo do shell: so a regra de
    // origem barra.
    ["GET", `https://outro.exemplo.test${construido.precache.find((c) => c.endsWith(".css"))}`],
    ["GET", "https://outro.exemplo.test/index.html"],
    ["POST", construido.precache.find((c) => c.endsWith(".js"))],
    ["GET", "/sw.js"],
    ["GET", "/arquivo-qualquer.txt"],
    ["GET", "/assets/nao-existe-no-build.js"],
  ];
  for (const [metodo, url] of naoIntercepta) {
    const r = await sw.buscar(url, { metodo, corpo: metodo === "POST" ? "{}" : undefined });
    assert.equal(r.interceptou, false, `${metodo} ${url} foi interceptada`);
  }
  assert.equal((await sw.buscar("/", { navegacao: true })).interceptou, true);
  assert.equal((await sw.buscar(construido.precache.find((c) => c.endsWith(".css")))).interceptou, true);

  const contexto = { origem: ORIGEM, shell: construido.shell };
  assert.equal(estrategiaPara({ method: "GET", url: `${ORIGEM}/`, mode: "navigate" }, contexto), NAVEGACAO);
  assert.equal(estrategiaPara({ method: "GET", url: `${ORIGEM}/index.html` }, contexto), DO_SHELL);
});

// ---------------------------------------------------------------------------
// P17 - tamanho
// ---------------------------------------------------------------------------

// O pre-carregamento do build real e de 1,17 MB na v0.13.0 - quase tudo o
// JavaScript do app. O teto deixa folga para o crescimento normal e pega o
// inchaco: uma imagem grande ou um pacote novo inteiro no shell.
const TETO_DO_PRE_CARREGAMENTO = 1.5 * 1024 * 1024;

test("P17 o tamanho do shell e reportado e fica dentro do teto", { skip: precisaDoBuild() }, (t) => {
  const tamanho = (caminho) => arquivosDaPasta(construido.pasta)(caminho).length;
  const pre = construido.precache.reduce((s, c) => s + tamanho(c), 0);
  const tudo = construido.shell.reduce((s, c) => s + tamanho(c), 0);
  t.diagnostic(`pre-carregamento: ${construido.precache.length} arquivos, ${(pre / 1024).toFixed(1)} KB`);
  t.diagnostic(`shell inteiro (o que PODE ser guardado): ${construido.shell.length} arquivos, ${(tudo / 1024).toFixed(1)} KB`);
  t.diagnostic(`sw.js: ${(construido.sw.length / 1024).toFixed(1)} KB`);
  assert.ok(pre <= TETO_DO_PRE_CARREGAMENTO, `pre-carregamento de ${(pre / 1024).toFixed(1)} KB passa do teto`);
  // As fontes pre-carregadas sao so WOFF2 de portugues.
  for (const fonteDoShell of construido.precache.filter((c) => /\.woff2?$/.test(c))) {
    assert.match(fonteDoShell, /-latin-(ext-)?\d{3}-normal-.+\.woff2$/);
  }
});

// ---------------------------------------------------------------------------
// P18 - chave de API em nenhum cache
// ---------------------------------------------------------------------------

// Montado por partes: o secret scan procura o formato literal no fonte.
const FORMA_DE_CHAVE = new RegExp(`${["sk", "ant", ""].join("-")}[A-Za-z0-9_-]{16,}`);

test("P18 chave de API em nenhum cache de nenhum tipo, nem no sw.js, nem no build", { skip: precisaDoBuild() }, async () => {
  const { sw, rede, cacheStorage } = await swAtivo();
  for (const [metodo, caminho, corpo] of NAVEGACAO_AUTENTICADA) {
    await sw.buscar(caminho, { metodo, corpo });
    await rede(new Request(`${ORIGEM}${caminho}`, { method: metodo, body: corpo }));
  }
  const { registros } = cacheStorage.inspecionar();
  for (const registro of registros) {
    assert.doesNotMatch(registro.texto, FORMA_DE_CHAVE, `forma de chave em ${registro.url}`);
    assert.equal(registro.texto.includes("ANTHROPIC_API_KEY"), false, registro.url);
  }
  assert.doesNotMatch(construido.sw, FORMA_DE_CHAVE);
  assert.equal(construido.sw.includes("ANTHROPIC"), false);
  for (const arquivo of construido.arquivos) {
    const conteudo = readFileSync(path.join(construido.pasta, arquivo), "latin1");
    assert.doesNotMatch(conteudo, FORMA_DE_CHAVE, arquivo);
    assert.equal(conteudo.includes("ANTHROPIC_API_KEY"), false, arquivo);
  }
  // E o IndexedDB nunca recebeu chave: a lista fechada da v0.11.0 (O11) segue.
});

// ---------------------------------------------------------------------------
// Renderizacao do JSX real, para P10 e R2
// ---------------------------------------------------------------------------

let telas = null;
async function renderizar() {
  if (telas) return telas;
  const { build } = await import("esbuild");
  const bundle = await build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import App from "./src/App.jsx";
        import { AllergyVerdict } from "./src/components/assistant/AllergyVerdict.jsx";
        import { AnuncioDoVeredito } from "./src/components/common/AnuncioDoVeredito.jsx";
        import { AvisoDeVersaoNova } from "./src/components/common/AvisoDeVersaoNova.jsx";
        import { AssistantPage } from "./src/pages/Assistant/AssistantPage.jsx";
        export const componentes = { App, AllergyVerdict, AnuncioDoVeredito, AvisoDeVersaoNova, AssistantPage };
        export const h = React.createElement;
        export const render = (elemento) => renderToStaticMarkup(elemento);
      `,
      resolveDir: rootDir,
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl", ".jpg": "dataurl", ".woff": "empty", ".woff2": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-sw-telas-"));
  const arquivo = path.join(dir, "telas.mjs");
  try {
    writeFileSync(arquivo, bundle.outputFiles[0].text, "utf8");
    telas = await import(pathToFileURL(arquivo).href);
    return telas;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// R1..R8 - regressao, pelo codigo real
// ---------------------------------------------------------------------------

test("R1 regressao: cache IndexedDB da v0.11.0 sem veredito, logout limpa, perfil atual vence", async () => {
  const fabrica = new IDBFactory();
  const cache = criarCacheOffline({ indexedDB: fabrica, agora: () => Date.UTC(2026, 9, 30), alergiasValidas: VALID_ALLERGY_IDS });
  const conta = { id: "conta-r1", name: "R1", email: "r1@example.test", allergies: ["peanut"], alertLevels: { peanut: "strict" } };
  await aoConfirmarConta(conta, { cache });
  await guardarProdutoVisto(conta.id, { code: "7896000000019", product_name: "Pacoca R1", ingredients_text: "amendoim", allergyVerdict: { status: "clear" }, safety: "normal" }, { cache });
  const antes = await inspecionarIndexedDB(fabrica);
  assert.match(antes, /Pacoca R1/);
  assert.doesNotMatch(antes, /allergyVerdict|"safety"/);
  // Perfil atual vence: o mesmo produto, dois perfis, dois vereditos.
  const lido = await consultarNoAparelho("7896000000019", { dono: conta.id, cache });
  assert.equal(avaliarNoAparelho(lido.produto, { profileAllergies: ["peanut"], alertLevels: { peanut: "strict" } }).allergyVerdict.minimumSafety, "urgent");
  assert.equal(avaliarNoAparelho(lido.produto, { profileAllergies: ["milk"] }).allergyVerdict.status, "clear");
  await aoSairDaConta({ sair: async () => {}, cache });
  const depois = await inspecionarIndexedDB(fabrica);
  for (const vestigio of ["Pacoca R1", "peanut", "conta-r1"]) assert.equal(depois.includes(vestigio), false, vestigio);
});

test("R2 regressao: acessibilidade da v0.12.0 - estado sem cor, ordem de leitura, aria-live polite", { skip: precisaDoBuild() }, async () => {
  const tela = await renderizar();
  const semCor = (html) => html.replace(/\sclass="[^"]*"/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const vereditos = {
    conflito: buildAllergyVerdict({ profileRisks: [{ id: "milk", label: "Leite/lactose", severity: "contains" }], profileAllergies: ["milk"], hasProductContext: true }),
    traco: buildAllergyVerdict({ profileRisks: [{ id: "milk", label: "Leite/lactose", severity: "traces" }], profileAllergies: ["milk"], hasProductContext: true }),
    semConflito: buildAllergyVerdict({ profileRisks: [], profileAllergies: ["milk"], hasProductContext: true }),
    naoAvaliado: buildAllergyVerdict({ profileRisks: [], profileAllergies: [], hasProductContext: true }),
  };
  const textos = Object.values(vereditos).map((verdict) => semCor(tela.render(tela.h(tela.componentes.AllergyVerdict, { verdict }))));
  assert.equal(new Set(textos).size, 4);
  assert.match(textos[0], /Conflito com o seu perfil/);
  assert.match(textos[3], /Não avaliado/);
  assert.match(tela.render(tela.h(tela.componentes.AnuncioDoVeredito, {})), /aria-live="polite"/);
  const assistente = tela.render(
    tela.h(tela.componentes.AssistantPage, {
      chatLogRef: { current: null },
      assistantConnection: { type: "success", message: "ok" },
      assistantMessages: [{ role: "assistant", text: "TEXTO-DO-MODELO", source: "anthropic", verdict: vereditos.conflito }],
      assistantLoading: false,
      assistantQuestion: "",
      hasLastQuestion: false,
      onQuestionChange: () => {},
      onSubmitAssistant: () => {},
      onRetryAssistant: () => {},
    }),
  );
  assert.ok(assistente.indexOf('role="group"') < assistente.indexOf("TEXTO-DO-MODELO"));
  assert.doesNotMatch(tela.render(tela.h(tela.componentes.App)), /aria-live="assertive"/);
});

test("R3 regressao: exploit C1 - o modelo negando o conflito nao entrega falso seguro", async () => {
  const resposta = await answerAssistantChat(
    { user: null },
    { message: "Posso consumir?", conversation: [], product: { name: "Leite", ingredients_text: "leite em po integral", allergens: ["milk"] }, guestAllergies: ["milk"] },
    {
      messages: {
        create: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ answer: "NAO contem leite, seguro.", category: "allergy", safety: "normal", usedProductContext: true }) }],
        }),
      },
    },
    { logger: { warn: () => {} } },
  );
  assert.equal(resposta.safety, "caution");
  assert.equal(resposta.allergyVerdict.status, "conflict");
  assert.equal(resposta.allergyVerdict.source, "deterministic_engine");
});

test("R4 regressao: matriz de severidade nos quatro casos", () => {
  const declarado = { name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };
  const traco = { name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal", traces: ["peanuts"] };
  const v = (produto, nivel) => {
    const snap = buildAssistantContext({ product: produto, allergies: ["peanut"] }).allergySnapshot;
    return buildAllergyVerdict({ profileRisks: snap.profileRisks, profileAllergies: snap.profileAllergies, hasProductContext: snap.hasProductContext, alertLevels: { peanut: nivel } });
  };
  for (const [produto, nivel, status, piso] of [
    [declarado, "standard", "conflict", "caution"],
    [declarado, "strict", "conflict", "urgent"],
    [traco, "strict", "conflict", "caution"],
    [traco, "standard", "traces", null],
  ]) {
    const veredito = v(produto, nivel);
    assert.equal(veredito.status, status, `${produto.name}/${nivel}`);
    assert.equal(veredito.minimumSafety, piso, `${produto.name}/${nivel}`);
  }
});

test("R5 regressao: comparacao sem contaminacao, explicacao amarrada pelo codigo", () => {
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  assert.equal(comparacao.products[0].allergyVerdict.status, "conflict");
  assert.equal(comparacao.products[1].allergyVerdict.status, "clear");
  assert.equal("allergyVerdict" in comparacao, false);
  const porCodigo = amarrarExplicacoes(
    [
      { productCode: "0036000291452", explanation: "ARROZ" },
      { productCode: "7891000100103", explanation: "LEITE" },
    ],
    comparacao.products,
  );
  assert.equal(porCodigo.get("7891000100103").explanation, "LEITE");
  assert.throws(() => amarrarExplicacoes([{ productCode: "0036000291452" }, { productCode: "5449000000996" }], comparacao.products));
});

async function comServidor(app, callback) {
  const servidor = createServer(app);
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${servidor.address().port}`);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("R6 regressao: sem sessao, exportar, excluir e ler colecoes respondem 401", async () => {
  await comServidor(createApp(), async (base) => {
    assert.equal((await fetch(`${base}/api/account/export`)).status, 401);
    const excluir = await fetch(`${base}/api/account`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: '{"password":"x"}' });
    assert.equal(excluir.status, 401);
    assert.equal((await fetch(`${base}/api/history?userId=1`)).status, 401);
  });
});

test("R7 regressao: digito verificador, UPC-A canonicalizado e tetos da comparacao", () => {
  assert.equal(validarCodigoDeBarras("7891000100103").valido, true);
  assert.equal(validarCodigoDeBarras("7891000100104").valido, false);
  assert.equal(validarCodigoDeBarras("036000291452").codigo, "0036000291452");
  assert.equal(TETO_COMPARACAO_POR_USUARIO, 30);
  assert.equal(TETO_COMPARACAO_POR_IP, 300);
  assert.equal(criarLimitadoresDeComparacao().length, 2);
});

test("R8 regressao: JSON malformado e 400 sem detalhe; rota desconhecida e 404 de API", async () => {
  await comServidor(createApp(), async (base) => {
    const resposta = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nao-e-json" });
    assert.equal(resposta.status, 400);
    const texto = await resposta.text();
    assert.equal(JSON.parse(texto).error.code, "INVALID_JSON");
    assert.doesNotMatch(texto, /SyntaxError|Unexpected token|\n\s+at /);
    const inexistente = await fetch(`${base}/api/nao-existe`);
    assert.equal(inexistente.status, 404);
    assert.match(inexistente.headers.get("content-type") ?? "", /json/);
  });
});
