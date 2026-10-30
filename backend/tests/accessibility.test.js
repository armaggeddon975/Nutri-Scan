import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { IDBFactory } from "fake-indexeddb";

import { createApp } from "../src/app.js";
import { answerAssistantChat } from "../src/ai/assistantService.js";
import { buildAssistantContext } from "../src/ai/contextBuilder.js";
import { criarLimitadoresDeComparacao, TETO_COMPARACAO_POR_IP, TETO_COMPARACAO_POR_USUARIO } from "../src/middleware/rateLimit.js";
import { amarrarExplicacoes } from "../src/services/comparisonService.js";
import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";
import { VALID_ALLERGY_IDS } from "../../shared/allergens.js";
import { mensagemDeRecusa, validarCodigoDeBarras } from "../../shared/barcode.js";
import { compareProducts } from "../../shared/productComparison.js";
import { criarCacheOffline } from "../../src/services/offlineCache.js";
import { avaliarNoAparelho, guardarProdutoVisto } from "../../src/services/offlineLookup.js";
import { aoConfirmarConta, aoSairDaConta } from "../../src/services/offlineSession.js";

// v0.12.0 - acessibilidade do alerta de alergia (WCAG 2.2 AA).
//
// O QUE ESTES TESTES INSPECIONAM. A ARVORE RENDERIZADA: o JSX real de `src/` e
// empacotado com esbuild e renderizado com `renderToStaticMarkup`, como o
// `assistantPageRender.test.js` faz desde a v0.6.8. As assercoes leem o HTML que
// sai - papel, nome, texto, ordem, atributos -, nao o codigo-fonte. As poucas
// leituras de fonte que restam sao COMPLEMENTO e estao marcadas como tal.
//
// O CSS e lido como o navegador o le: os dois arquivos, na ordem em que o
// `main.jsx` os importa, com a ultima declaracao vencendo. O contraste e
// calculado pela formula da WCAG a partir dos tokens reais de `:root`.
//
// O QUE ELES NAO PROVAM. Que a experiencia com leitor de tela e boa. Eles provam
// que a informacao esta exposta - papel, nome, regiao viva, ordem. Ouvir o
// NVDA, o VoiceOver ou o TalkBack lendo o alerta e verificacao humana, e
// continua aberta (docs/ACESSIBILIDADE.md).

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const fonte = (relativo) => readFileSync(path.join(rootDir, relativo), "utf8");

// ---------------------------------------------------------------------------
// Renderizacao do JSX real
// ---------------------------------------------------------------------------

async function carregarTelas() {
  let esbuild;
  try {
    esbuild = await import("esbuild");
    await import("react");
    await import("react-dom/server");
  } catch {
    return null;
  }
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import App from "./src/App.jsx";
        import { AllergyVerdict } from "./src/components/assistant/AllergyVerdict.jsx";
        import { AnuncioDoVeredito } from "./src/components/common/AnuncioDoVeredito.jsx";
        import { StatusLine } from "./src/components/common/StatusLine.jsx";
        import { ProductAnalysis } from "./src/components/food/ProductAnalysis.jsx";
        import { AllergyPicker } from "./src/components/allergies/AllergyPicker.jsx";
        import { AlertLevelPicker } from "./src/components/allergies/AlertLevelPicker.jsx";
        import { AssistantPage } from "./src/pages/Assistant/AssistantPage.jsx";
        import { ComparePage } from "./src/pages/Compare/ComparePage.jsx";
        import { ScannerPage } from "./src/pages/Scanner/ScannerPage.jsx";
        import { SearchPage } from "./src/pages/Search/SearchPage.jsx";
        export * as estado from "./src/utils/estadoDoVeredito.js";
        const telas = { App, AllergyVerdict, AnuncioDoVeredito, StatusLine, ProductAnalysis, AllergyPicker,
          AlertLevelPicker, AssistantPage, ComparePage, ScannerPage, SearchPage };
        export const h = React.createElement;
        export const tela = (nome) => telas[nome];
        export function render(elemento) {
          return renderToStaticMarkup(elemento);
        }
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
  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-a11y-"));
  const arquivo = path.join(dir, "telas.mjs");
  try {
    writeFileSync(arquivo, bundle.outputFiles[0].text, "utf8");
    return await import(pathToFileURL(arquivo).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const telas = await carregarTelas();
const semEsbuild = telas ? false : "NAO EXECUTADO - esbuild/react ausentes: instale as dependencias do package raiz";

function renderizar(nome, props = {}) {
  return telas.render(telas.h(telas.tela(nome), props));
}

// Texto que o leitor de tela recebe: o HTML sem tags, com as entidades basicas.
const textoDe = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// Tira TODA informacao de cor da arvore: classe (o tom vive nela), estilo
// inline e os icones (svg). O que sobra e o que chega sem cor nenhuma.
const semCor = (html) =>
  html
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "");

// Tira o que so o leitor de tela ouve (sr-only): sobra o texto VISIVEL.
const semSrOnly = (html) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, "");

function atributos(tag) {
  const mapa = {};
  // O React grava `readOnly`; o HTML nao distingue maiuscula em atributo.
  for (const m of tag.matchAll(/\s([a-zA-Z-:]+)(?:="([^"]*)")?/g)) mapa[m[1].toLowerCase()] = m[2] ?? "";
  return mapa;
}

// Elementos de um tipo, com atributos e posicao no HTML.
function elementos(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}(\\s[^>]*)?>`, "g"))].map((m) => ({
    ...atributos(m[0]),
    _pos: m.index,
    _tag: m[0],
  }));
}

function porId(html, id) {
  const m = html.match(new RegExp(`<(\\w+)[^>]*\\sid="${id.replace(/[:]/g, "\\$&")}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? { tag: m[1], abertura: m[0].slice(0, m[0].indexOf(">") + 1), texto: textoDe(m[2]) } : null;
}

// ---------------------------------------------------------------------------
// Vereditos - todos do motor de shared/, nenhum escrito a mao
// ---------------------------------------------------------------------------

const LEITE = { id: "milk", label: "Leite/lactose" };

const VEREDITOS = {
  conflito: buildAllergyVerdict({
    profileRisks: [{ ...LEITE, severity: "contains" }],
    profileAllergies: ["milk"],
    hasProductContext: true,
  }),
  traco: buildAllergyVerdict({
    profileRisks: [{ ...LEITE, severity: "traces" }],
    profileAllergies: ["milk"],
    hasProductContext: true,
  }),
  semConflito: buildAllergyVerdict({ profileRisks: [], profileAllergies: ["milk"], hasProductContext: true }),
  naoAvaliado: buildAllergyVerdict({ profileRisks: [], profileAllergies: [], hasProductContext: true }),
};
const URGENTE = buildAllergyVerdict({
  profileRisks: [{ ...LEITE, severity: "contains" }],
  profileAllergies: ["milk"],
  hasProductContext: true,
  alertLevels: { milk: "strict" },
});
const SEM_DADO = buildAllergyVerdict({
  profileRisks: [],
  profileAllergies: ["milk"],
  hasProductContext: true,
  allergenDataAvailable: false,
});

// A palavra que diz o estado - sem ela, o estado nao chegou.
const PALAVRA_DO_ESTADO = {
  conflito: /Conflito com o seu perfil/,
  traco: /Pode conter traços/,
  semConflito: /Sem conflito com o seu perfil/,
  naoAvaliado: /Não avaliado/,
};

// ---------------------------------------------------------------------------
// A1t - A COR NUNCA E O UNICO SINAL (1.4.1)
// ---------------------------------------------------------------------------

test("A1t sem cor, os quatro estados do veredito continuam distinguiveis por texto", { skip: semEsbuild }, () => {
  const visivel = {};
  const acessivel = {};
  for (const [estado, verdict] of Object.entries(VEREDITOS)) {
    const html = renderizar("AllergyVerdict", { verdict });
    assert.ok(html.length > 0, `${estado}: o bloco nao foi renderizado`);
    // Sem classe, sem estilo, sem icone.
    const cru = semCor(html);
    assert.doesNotMatch(cru, /class=|style=|<svg/);
    visivel[estado] = textoDe(semSrOnly(cru));
    acessivel[estado] = textoDe(cru);
    // O texto diz o ESTADO - nao so o contexto.
    assert.match(visivel[estado], PALAVRA_DO_ESTADO[estado], `${estado}: o texto nao diz o estado`);
    // E o titulo do bloco - a primeira linha - e o estado.
    const titulo = textoDe(semSrOnly(cru).match(/<p[^>]*>([\s\S]*?)<\/p>/)[1]);
    assert.match(titulo, PALAVRA_DO_ESTADO[estado], `${estado}: o titulo nao e o estado`);
  }
  // Quatro textos diferentes, para o olho e para o leitor de tela.
  assert.equal(new Set(Object.values(visivel)).size, 4, "dois estados ficaram iguais sem cor");
  assert.equal(new Set(Object.values(acessivel)).size, 4);
  // Nenhum estado "contem" o titulo de outro (conflito vs sem conflito).
  assert.doesNotMatch(visivel.semConflito, /^Conflito/);
  assert.doesNotMatch(visivel.conflito, /Sem conflito/);

  // Alerta maximo tem o proprio titulo, tambem sem cor.
  const urgente = textoDe(semCor(renderizar("AllergyVerdict", { verdict: URGENTE })));
  assert.match(urgente, /Alerta máximo: conflito com o seu perfil/);

  // Na comparacao, os dois estados lado a lado tambem chegam sem cor.
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  const tela = textoDe(semCor(renderizar("ComparePage", propsDaComparacao({ resultado: comparacao }))));
  assert.match(tela, /Leite em po: Conflito com o seu perfil/);
  assert.match(tela, /Biscoito de arroz: Sem conflito com o seu perfil/);
});

// ---------------------------------------------------------------------------
// A2t - O TEXTO DIZ O ESTADO, NAO SO O NOME DO ALERGENICO (1.4.1, 1.3.1)
// ---------------------------------------------------------------------------

test("A2t cada alergenico do veredito vem com o seu estado escrito", { skip: semEsbuild }, () => {
  const casos = [
    [VEREDITOS.conflito, "Contém Leite/lactose"],
    [VEREDITOS.traco, "Pode conter Leite/lactose"],
    [URGENTE, "Contém Leite/lactose · alerta máximo"],
  ];
  for (const [verdict, esperado] of casos) {
    const html = renderizar("AllergyVerdict", { verdict });
    const etiquetas = [...html.matchAll(/<span class="danger-tag">([^<]*)<\/span>/g)].map((m) => m[1]);
    assert.ok(etiquetas.length > 0, "o veredito com risco nao mostrou etiqueta");
    for (const etiqueta of etiquetas) {
      // Nunca o nome sozinho: "Leite/lactose" em vermelho dependeria da cor.
      assert.match(etiqueta, /^(Contém|Pode conter) /, `etiqueta sem estado: "${etiqueta}"`);
    }
    assert.ok(etiquetas.includes(esperado), `faltou "${esperado}" em ${JSON.stringify(etiquetas)}`);
  }
  // "Nao avaliado" diz POR QUE, e cada motivo e diferente.
  const semPerfil = textoDe(renderizar("AllergyVerdict", { verdict: VEREDITOS.naoAvaliado }));
  const semDado = textoDe(renderizar("AllergyVerdict", { verdict: SEM_DADO }));
  assert.match(semPerfil, /Você não marcou alergias\. O app não conferiu conflito\./);
  assert.match(semDado, /Sem dados de alergênicos\. Confira o rótulo físico\./);

  // Na tela do produto, os "Pontos de atencao" tambem dizem o estado.
  const html = renderizar("ProductAnalysis", propsDoProduto(PRODUTO_LEITE, ["milk"]));
  for (const m of html.matchAll(/<span class="soft-tag">([^<]*)<\/span>/g)) {
    assert.match(m[1], /^(Contém|Pode conter) /, `ponto de atencao sem estado: "${m[1]}"`);
  }
});

// ---------------------------------------------------------------------------
// A3t - CONTRASTE (1.4.3, 1.4.11)
// ---------------------------------------------------------------------------

// O CSS como o navegador o le: comentarios fora, regras na ordem, @media
// anotado, @keyframes ignorado.
function lerRegras(relativo) {
  const css = fonte(relativo).replace(/\/\*[\s\S]*?\*\//g, "");
  const regras = [];
  const pilha = [];
  let buffer = "";
  for (const ch of css) {
    if (ch === "{") {
      pilha.push(buffer.trim());
      buffer = "";
    } else if (ch === "}") {
      const cabecalho = pilha.pop();
      if (cabecalho !== undefined && !cabecalho.startsWith("@")) {
        const contexto = pilha.filter((item) => item.startsWith("@"));
        if (!contexto.some((item) => item.startsWith("@keyframes"))) {
          const declaracoes = {};
          for (const parte of buffer.split(";")) {
            const i = parte.indexOf(":");
            if (i > 0) declaracoes[parte.slice(0, i).trim().toLowerCase()] = parte.slice(i + 1).trim();
          }
          regras.push({
            arquivo: relativo,
            seletores: cabecalho.split(",").map((s) => s.trim().replace(/\s+/g, " ")),
            media: contexto.join(" ") || null,
            declaracoes,
          });
        }
      }
      buffer = "";
    } else {
      buffer += ch;
    }
  }
  return regras;
}

// A ordem do main.jsx: o arquivo de design, depois o de sobreposicao.
const ARQUIVOS_CSS = ["src/styles.css", "src/styles-v070.css"];
function todasAsRegras() {
  const ordem = fonte("src/main.jsx");
  const posicoes = ARQUIVOS_CSS.map((arquivo) => ordem.indexOf(`./${path.basename(arquivo)}`));
  assert.ok(posicoes.every((p) => p >= 0) && posicoes[0] < posicoes[1], "a ordem de importacao do CSS mudou");
  return ARQUIVOS_CSS.flatMap(lerRegras);
}

function tokens(regras) {
  const mapa = {};
  for (const regra of regras) {
    if (regra.media || !regra.seletores.includes(":root")) continue;
    for (const [prop, valor] of Object.entries(regra.declaracoes)) if (prop.startsWith("--")) mapa[prop] = valor;
  }
  return mapa;
}

function resolver(valor, mapa) {
  let atual = String(valor);
  for (let i = 0; i < 10 && atual.includes("var("); i += 1) {
    atual = atual.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (_, nome, padrao) => mapa[nome] ?? padrao ?? "");
  }
  return atual.replace(/\s*!important$/, "").trim();
}

// O valor que vence para um seletor exato: a ultima declaracao, no contexto
// pedido (sem @media, por padrao).
function declarado(regras, seletor, prop, { media = null } = {}) {
  let valor;
  for (const regra of regras) {
    if (regra.media !== media) continue;
    if (!regra.seletores.includes(seletor)) continue;
    if (prop in regra.declaracoes) valor = regra.declaracoes[prop];
  }
  return valor;
}

function cor(texto) {
  const t = texto.trim().toLowerCase();
  if (t === "white" || t === "#fff" || t === "#ffffff") return { rgb: [255, 255, 255], a: 1 };
  let m = t.match(/^#([0-9a-f]{6})$/);
  if (m) return { rgb: [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)), a: 1 };
  m = t.match(/^#([0-9a-f]{3})$/);
  if (m) return { rgb: [...m[1]].map((c) => parseInt(c + c, 16)), a: 1 };
  m = t.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
  throw new Error(`cor nao reconhecida: ${texto}`);
}

// Cor com transparencia (rgba ou opacidade) desenhada sobre o fundo.
const sobre = (frente, fundo, alfa = frente.a) => frente.rgb.map((v, i) => Math.round(v * alfa + fundo[i] * (1 - alfa)));

function luminancia(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (escuro + 0.05);
}

function px(valor, mapa) {
  const texto = resolver(valor, mapa).replace(/env\([^,()]+,\s*([^()]+)\)/g, "$1");
  const conta = texto.match(/^calc\((.*)\)$/);
  const termos = (conta ? conta[1] : texto).split("+").map((termo) => termo.trim());
  let total = 0;
  for (const termo of termos) {
    const m = termo.match(/^(-?[\d.]+)(px|rem)?$/);
    if (!m) return Number.NaN;
    total += Number(m[1]) * (m[2] === "rem" ? 16 : 1);
  }
  return total;
}

// Os pares do caminho do alerta. Cada um sai das regras REAIS: o seletor diz de
// onde vem a cor do texto e a do fundo; os tokens dao o valor.
function paresDeContraste(regras) {
  const mapa = tokens(regras);
  const valor = (seletor, prop) => {
    const v = declarado(regras, seletor, prop);
    assert.ok(v !== undefined, `${seletor} nao declara ${prop}`);
    return resolver(v, mapa);
  };
  const corDe = (seletor, prop) => cor(valor(seletor, prop));
  const token = (nome) => cor(resolver(`var(${nome})`, mapa));
  const fundos = { "--bg": token("--bg").rgb, "--surface": token("--surface").rgb, "--surface-2": token("--surface-2").rgb };
  const pares = [];
  const par = (nome, frente, fundo, minimo, tipo, alfa) => {
    const fundoRgb = Array.isArray(fundo) ? fundo : fundo.rgb;
    const frenteRgb = sobre(frente, fundoRgb, alfa ?? frente.a);
    pares.push({ nome, minimo, tipo, valor: contraste(frenteRgb, fundoRgb) });
  };

  // O bloco de veredito, nos quatro tons. O titulo e texto GRANDE (24px, 600);
  // o resto e texto normal. A origem leva a opacidade que vencer no CSS.
  const tamanhoDoTitulo = px(valor(".allergy-verdict-title", "font-size"), mapa);
  assert.ok(tamanhoDoTitulo >= 24, "o titulo do veredito deixou de ser texto grande - o minimo vira 4.5");
  const opacidadeDaOrigem = Number(resolver(declarado(regras, ".allergy-verdict-origin", "opacity") ?? "1", mapa));
  for (const tom of ["danger", "warning", "safe", "neutral"]) {
    const seletor = `.allergy-verdict.${tom}`;
    const fundo = corDe(seletor, "background");
    const tinta = corDe(seletor, "color");
    par(`veredito ${tom}: titulo (24px)`, tinta, fundo, 3, "texto grande");
    par(`veredito ${tom}: motivo e alerta (17px)`, tinta, fundo, 4.5, "texto");
    par(`veredito ${tom}: origem (15px, opacidade ${opacidadeDaOrigem})`, tinta, fundo, 4.5, "texto", opacidadeDaOrigem);
  }
  par("etiqueta de risco (Contém/Pode conter)", corDe(".danger-tag", "color"), corDe(".danger-tag", "background"), 4.5, "texto");

  // Erro e dica do campo de codigo, sobre o creme e sobre o papel.
  for (const [nome, rgb] of Object.entries(fundos)) {
    par(`erro do campo sobre ${nome}`, corDe(".field-error", "color"), rgb, 4.5, "texto");
    par(`dica do campo sobre ${nome}`, corDe(".field-hint", "color"), rgb, 4.5, "texto");
  }
  for (const tom of ["success", "warning", "error"]) {
    const seletor = `.status-line.${tom}`;
    par(`linha de status ${tom}`, corDe(seletor, "color"), corDe(seletor, "background"), 4.5, "texto");
  }
  par("linha de status neutra", corDe(".status-line", "color"), corDe(".status-line", "background"), 4.5, "texto");

  // Comparacao.
  par("comparacao: falta de dado (compare-missing)", corDe(".compare-missing", "color"), corDe(".compare-col", "background"), 4.5, "texto");
  par("comparacao: 'Do aparelho'", corDe(".compare-stored", "color"), corDe(".compare-col", "background"), 4.5, "texto");
  par("comparacao: mensagem de aviso", corDe(".compare-message.warning", "color"), fundos["--bg"], 4.5, "texto");
  par("comparacao: texto do campo", token("--ink"), corDe(".compare-field input", "background"), 4.5, "texto");

  // Aviso de leitura sem rede (v0.11.0), que fica acima do veredito.
  par("aviso sem rede: titulo", corDe(".offline-notice", "color"), corDe(".offline-notice", "background"), 4.5, "texto");
  par("aviso sem rede: texto", corDe(".offline-notice span", "color"), corDe(".offline-notice", "background"), 4.5, "texto");

  // Rotulos e campos.
  par("rotulo do campo (busca e camera)", corDe(".search-card label", "color"), fundos["--bg"], 4.5, "texto");
  par("rotulo da pergunta ao assistente", corDe(".assistant-label", "color"), fundos["--surface"], 4.5, "texto");
  par("texto digitado no campo", corDe(".input-row input", "color"), corDe(".input-row input", "background"), 4.5, "texto");
  par("dica dentro do campo (placeholder)", corDe(".input-row input::placeholder", "color"), corDe(".input-row input", "background"), 4.5, "texto");
  par("sobretitulo da tela", corDe(".eyebrow", "color"), fundos["--bg"], 4.5, "texto");

  // Botoes do caminho do alerta.
  par("botao principal", corDe(".primary-button", "color"), corDe(".primary-button", "background"), 4.5, "texto");
  par("botao secundario", corDe(".secondary-button", "color"), corDe(".secondary-button", "background"), 4.5, "texto");
  par("botao de busca do campo", corDe(".input-row button", "color"), corDe(".input-row button", "background"), 4.5, "texto");
  par("botao de enviar pergunta", corDe(".assistant-form button", "color"), corDe(".assistant-form button", "background"), 4.5, "texto");
  par("sugestao de pergunta", corDe(".prompt-suggestions button", "color"), corDe(".prompt-suggestions button", "background"), 4.5, "texto");
  par("escolha em Meus produtos", corDe(".chip-list button", "color"), corDe(".chip-list button", "background"), 4.5, "texto");

  // Seletor de alergias e nivel de alerta.
  par("linha de alergia", token("--ink"), corDe(".check-row", "background"), 4.5, "texto");
  par("linha de alergia marcada", corDe(".check-row:has(input:checked)", "color"), corDe(".check-row:has(input:checked)", "background"), 4.5, "texto");
  par("linha de alerta maximo marcada", corDe(".alert-level-row:has(input:checked)", "color"), corDe(".alert-level-row:has(input:checked)", "background"), 4.5, "texto");
  par("alergia escolhida (etiqueta)", corDe(".allergy-chip", "color"), corDe(".allergy-chip", "background"), 4.5, "texto");
  par("titulo de grupo de alergias (14px)", corDe(".allergy-picker-group-title", "color"), corDe(".allergy-picker-group-title", "background"), 4.5, "texto");
  par("texto do nivel de alerta", corDe(".alert-level-copy", "color"), fundos["--surface"], 4.5, "texto");

  // Barras escuras: abas e busca do topo.
  const chrome = corDe(".tabbar", "background");
  par("aba inativa (rotulo 14px)", corDe(".tab-item", "color"), chrome, 4.5, "texto");
  par("aba ativa", corDe(".tab-item.active", "color"), chrome, 4.5, "texto");
  const campoDoTopo = sobre(corDe(".topbar-search", "background"), corDe(".topbar", "background").rgb);
  par("busca do topo: texto", corDe(".topbar-search input", "color"), campoDoTopo, 4.5, "texto");
  par("busca do topo: dica", corDe(".topbar-search input::placeholder", "color"), campoDoTopo, 4.5, "texto");

  // 1.4.11 - INDICADORES: anel de foco, borda de campo, caixa de marcar.
  const anel = cor(resolver(declarado(regras, ":focus-visible", "outline").split(/\s+/).slice(2).join(" "), mapa));
  for (const nome of ["--bg", "--surface", "--surface-2", "--danger-soft", "--warn-soft", "--ok-soft", "--brand-soft"]) {
    par(`anel de foco sobre ${nome}`, anel, token(nome), 3, "indicador");
  }
  par("anel de foco nas barras escuras", cor(valor(".topbar :focus-visible", "outline-color")), chrome, 3, "indicador");
  par("anel da busca do topo", cor(valor(".topbar-search:focus-within", "outline").split(/\s+/).slice(2).join(" ")), chrome, 3, "indicador");
  const bordaDaComparacao = cor(valor(".compare-field input", "border-color"));
  par("borda do campo da comparacao sobre --bg", bordaDaComparacao, fundos["--bg"], 3, "indicador");
  par("borda do campo da comparacao sobre o campo", bordaDaComparacao, corDe(".compare-field input", "background"), 3, "indicador");
  par("caixa de alergia marcada", corDe(".check-row input", "accent-color"), corDe(".check-row", "background"), 3, "indicador");
  par("caixa de alerta maximo marcada", corDe(".alert-level-row input", "accent-color"), corDe(".alert-level-row:has(input:checked)", "background"), 3, "indicador");

  return pares;
}

test("A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3", (t) => {
  const regras = todasAsRegras();

  // "Nos dois temas": o app tem UM tema. Se um tema escuro aparecer, este teste
  // para de valer e precisa medir o outro tambem.
  for (const arquivo of ARQUIVOS_CSS) assert.doesNotMatch(fonte(arquivo), /prefers-color-scheme\s*:\s*dark|data-theme/, `${arquivo} ganhou tema escuro`);
  assert.equal(resolver(declarado(regras, ":root", "color-scheme"), {}), "light");

  const pares = paresDeContraste(regras);
  assert.ok(pares.length >= 50, `so ${pares.length} pares medidos`);
  const reprovados = [];
  for (const par of pares) {
    t.diagnostic(`${par.valor.toFixed(2)}:1 (min ${par.minimo}) ${par.tipo} - ${par.nome}`);
    if (!(par.valor >= par.minimo)) reprovados.push(`${par.nome}: ${par.valor.toFixed(2)} < ${par.minimo}`);
  }
  assert.deepEqual(reprovados, [], `pares abaixo do minimo:\n${reprovados.join("\n")}`);
});

// ---------------------------------------------------------------------------
// A4t - PAPEL E NOME (4.1.2, 1.3.1)
// ---------------------------------------------------------------------------

test("A4t o bloco de veredito e um grupo com nome: o estado, e o produto quando ha", { skip: semEsbuild }, () => {
  for (const [estado, verdict] of Object.entries(VEREDITOS)) {
    const html = renderizar("AllergyVerdict", { verdict, rotulo: "Paçoca Rolha" });
    const [bloco] = elementos(html, "div");
    assert.equal(bloco.role, "group", `${estado}: sem papel`);
    assert.ok(bloco["aria-labelledby"], `${estado}: sem nome`);
    const nome = porId(html, bloco["aria-labelledby"]);
    assert.ok(nome, `${estado}: aria-labelledby aponta para id que nao existe`);
    assert.match(nome.texto, PALAVRA_DO_ESTADO[estado]);
    assert.match(nome.texto, /^Paçoca Rolha: /, `${estado}: o nome nao diz de qual produto`);
    // O bloco NAO e regiao viva: quem anuncia e a regiao unica (A5t) ou o log
    // do assistente. Dois anunciantes leriam o mesmo alerta duas vezes.
    assert.doesNotMatch(html, /aria-live|role="status"|role="alert"/);
    // O icone e decorativo: o texto ja diz tudo.
    for (const svg of elementos(html, "svg")) assert.equal(svg["aria-hidden"], "true");
  }
  // Sem produto, nenhum bloco - nada de "nao avaliado" inventado.
  const semProduto = buildAllergyVerdict({ profileRisks: [], profileAllergies: ["milk"], hasProductContext: false });
  assert.equal(renderizar("AllergyVerdict", { verdict: semProduto }), "");
});

// ---------------------------------------------------------------------------
// A5t - O VEREDITO QUE APARECE APOS UMA ACAO E ANUNCIADO (4.1.3)
// ---------------------------------------------------------------------------

test("A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro", { skip: semEsbuild }, () => {
  // A regiao, sozinha.
  const vazia = renderizar("AnuncioDoVeredito", {});
  const [regiao] = elementos(vazia, "p");
  assert.equal(regiao.id, "anuncio-do-veredito");
  assert.equal(regiao["aria-live"], "polite", "a politeness decidida e polite");
  assert.equal(regiao["aria-atomic"], "true");
  assert.equal(textoDe(vazia), "");

  // O app inteiro: a regiao ja esta no primeiro HTML, vazia, uma vez so, fora
  // das telas - existe ANTES de qualquer veredito, e por isso a mudanca e lida.
  const app = renderizar("App");
  const regioes = app.match(/id="anuncio-do-veredito"/g) ?? [];
  assert.equal(regioes.length, 1);
  const noApp = porId(app, "anuncio-do-veredito");
  assert.match(noApp.abertura, /aria-live="polite"/);
  assert.equal(noApp.texto, "");
  assert.ok(app.indexOf('id="anuncio-do-veredito"') < app.indexOf("<main"), "a regiao esta dentro de uma tela");
  // Nenhuma outra regiao assertive no app.
  assert.doesNotMatch(app, /aria-live="assertive"/);

  // O texto anunciado: o nome do produto e o ESTADO, antes dos alergenicos.
  const { anuncioDoProduto, anuncioDaComparacao } = telas.estado;
  const casos = [
    [VEREDITOS.conflito, "Paçoca. Conflito com o seu perfil: Contém Leite/lactose."],
    [VEREDITOS.traco, "Paçoca. Pode conter traços: Pode conter Leite/lactose."],
    [VEREDITOS.semConflito, "Paçoca. Sem conflito com o seu perfil."],
    [VEREDITOS.naoAvaliado, "Paçoca. Não avaliado. Você não marcou alergias. O app não conferiu conflito."],
    [URGENTE, "Paçoca. Alerta máximo: conflito com o seu perfil: Contém Leite/lactose · alerta máximo."],
  ];
  for (const [verdict, esperado] of casos) {
    const texto = anuncioDoProduto("Paçoca", verdict);
    assert.equal(texto, esperado);
    const html = renderizar("AnuncioDoVeredito", { texto, vez: 1 });
    assert.equal(textoDe(html), esperado);
    assert.match(html, /aria-live="polite"/);
  }
  // O mesmo veredito anunciado de novo muda o texto (um espaco), para ser lido.
  const primeira = renderizar("AnuncioDoVeredito", { texto: casos[0][1], vez: 1 });
  const segunda = renderizar("AnuncioDoVeredito", { texto: casos[0][1], vez: 2 });
  assert.notEqual(primeira, segunda);

  // A comparacao pronta: os dois estados, cada um com o nome do seu produto.
  const comparacao = anuncioDaComparacao([
    { name: "Leite em po", allergyVerdict: VEREDITOS.conflito },
    { name: "Biscoito de arroz", allergyVerdict: VEREDITOS.semConflito },
  ]);
  assert.equal(
    comparacao,
    "Comparação pronta. Primeiro produto, Leite em po. Conflito com o seu perfil: Contém Leite/lactose. " +
      "Segundo produto, Biscoito de arroz. Sem conflito com o seu perfil.",
  );
  // E o anuncio nunca orienta: diz o que o produto contem e o que o perfil declara.
  for (const [verdict] of casos) {
    assert.doesNotMatch(anuncioDoProduto("X", verdict), /evite|não consuma|procure|médic|recomend|seguro para/i);
  }
});

// ---------------------------------------------------------------------------
// A6t - ORDEM DE LEITURA: O VEREDITO ANTES DO TEXTO DO MODELO (1.3.2)
// ---------------------------------------------------------------------------

const TEXTO_DO_MODELO = "TEXTO-DO-MODELO: este produto nao contem leite e e totalmente seguro.";

test("A6t no assistente, na tela do produto e na comparacao, o veredito vem antes", { skip: semEsbuild }, () => {
  // Assistente: o veredito antes do texto do modelo, dentro do log.
  const html = renderizar("AssistantPage", propsDoAssistente([
    { role: "user", text: "Posso consumir?" },
    { role: "assistant", text: TEXTO_DO_MODELO, source: "anthropic", verdict: VEREDITOS.conflito },
  ]));
  const log = html.indexOf('role="log"');
  const veredito = html.indexOf('role="group"');
  const texto = html.indexOf("TEXTO-DO-MODELO");
  assert.ok(log >= 0 && veredito > log, "o veredito nao esta no log");
  assert.ok(veredito < texto, "o texto do modelo e lido antes do veredito");
  assert.ok(textoDe(html).indexOf("Conflito com o seu perfil") < textoDe(html).indexOf("TEXTO-DO-MODELO"));

  // Tela do produto: o veredito logo depois do nome, antes de tabela,
  // ingredientes e pontos de atencao.
  const produto = renderizar("ProductAnalysis", propsDoProduto(PRODUTO_LEITE, ["milk"]));
  const posVeredito = produto.indexOf('role="group"');
  assert.ok(posVeredito > produto.indexOf("<h3"), "o veredito veio antes do nome do produto");
  for (const secao of ["Tabela nutricional", "Ingredientes", "Pontos de atenção"]) {
    const pos = produto.indexOf(secao);
    if (pos >= 0) assert.ok(posVeredito < pos, `"${secao}" e lido antes do veredito`);
  }

  // Comparacao: em cada coluna, o veredito antes da explicacao do modelo.
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  comparacao.products = comparacao.products.map((p) => ({ ...p, explanation: `EXPLICACAO-${p.slot}` }));
  const tela = renderizar("ComparePage", propsDaComparacao({ resultado: comparacao }));
  for (const lado of ["a", "b"]) {
    const coluna = tela.indexOf(lado === "a" ? "Primeiro produto:" : "Segundo produto:");
    const grupo = tela.indexOf('role="group"', coluna);
    const explicacao = tela.indexOf(`EXPLICACAO-${lado}`);
    assert.ok(explicacao > 0, "a explicacao nao foi renderizada");
    assert.ok(grupo > coluna && grupo < explicacao, `coluna ${lado}: a explicacao vem antes do veredito`);
  }
});

// ---------------------------------------------------------------------------
// A7t - COMPARACAO: CADA VEREDITO ASSOCIADO AO SEU PRODUTO (1.3.1, 4.1.2)
// ---------------------------------------------------------------------------

test("A7t na comparacao, coluna, veredito e cabecalho de tabela dizem o nome do produto", { skip: semEsbuild }, () => {
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal", traces_tags: ["en:milk"] } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  const html = renderizar("ComparePage", propsDaComparacao({ resultado: comparacao }));
  const colunas = elementos(html, "article");
  assert.deepEqual(colunas.map((c) => c["aria-label"]), ["Primeiro produto: Leite em po", "Segundo produto: Biscoito de arroz"]);

  // Cada grupo de veredito, dentro da SUA coluna, com o nome do SEU produto.
  const nomes = elementos(html, "div").filter((d) => d.role === "group").map((d) => porId(html, d["aria-labelledby"]).texto);
  assert.deepEqual(nomes, ["Leite em po: Conflito com o seu perfil", "Biscoito de arroz: Pode conter traços"]);
  const [, inicioB] = colunas.map((c) => c._pos);
  const grupos = elementos(html, "div").filter((d) => d.role === "group").map((d) => d._pos);
  assert.ok(grupos[0] < inicioB && grupos[1] > inicioB, "um veredito ficou na coluna do outro produto");

  // As tabelas: "Primeiro"/"Segundo" levam o nome, que o leitor le com a celula.
  // Sem espaco entre as tags: o trecho sr-only continua a palavra visivel.
  const cabecalhos = [...html.matchAll(/<th scope="col">([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  assert.ok(cabecalhos.includes("Primeiro: Leite em po"), JSON.stringify(cabecalhos));
  assert.ok(cabecalhos.includes("Segundo: Biscoito de arroz"));

  // Com um lado faltando, a coluna que faltou diz o codigo.
  const parcial = {
    a: { produto: comparacao.products[0], consulta: { codigo: "7891000100103" } },
    b: { produto: null, consulta: { codigo: "0036000291452", estado: "nao_encontrado" } },
  };
  const metade = renderizar("ComparePage", propsDaComparacao({ parcial }));
  assert.deepEqual(elementos(metade, "article").map((c) => c["aria-label"]), [
    "Primeiro produto: Leite em po",
    "Segundo produto: código 0036000291452",
  ]);
});

// ---------------------------------------------------------------------------
// A8t - TECLADO (2.1.1, 2.1.2, 2.4.3)
// ---------------------------------------------------------------------------

function telasDoCaminho() {
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  return {
    app: renderizar("App"),
    produto: renderizar("ProductAnalysis", propsDoProduto(PRODUTO_LEITE, ["milk"])),
    assistente: renderizar("AssistantPage", propsDoAssistente([{ role: "assistant", text: "x", verdict: VEREDITOS.conflito }])),
    comparacao: renderizar("ComparePage", propsDaComparacao({ resultado: comparacao })),
    camera: renderizar("ScannerPage", propsDaCamera()),
    busca: renderizar("SearchPage", propsDaBusca()),
    alergias: renderizar("AllergyPicker", { selectedAllergies: ["milk"], onToggleAllergy: () => {} }),
    nivel: renderizar("AlertLevelPicker", { selectedAllergies: ["milk"], alertLevels: {}, onSetAlertLevel: () => {} }),
  };
}

test("A8t todo controle do caminho do alerta e nativo, alcancavel e sem armadilha", { skip: semEsbuild }, () => {
  for (const [nome, html] of Object.entries(telasDoCaminho())) {
    // Controle de verdade: botao, campo, link. Nada de div ou span "clicavel".
    assert.doesNotMatch(html, /<(div|span|p|li|img)[^>]*\s(role="(button|link|checkbox)"|tabindex="0")/, `${nome}: controle que nao e nativo`);
    // Nenhum tabindex positivo: a ordem de foco e a do documento.
    assert.doesNotMatch(html, /tabindex="[1-9]/, `${nome}: tabindex positivo`);
    // tabindex=-1 so nos titulos que recebem o foco quando a tela troca.
    for (const m of html.matchAll(/<(\w+)[^>]*tabindex="-1"[^>]*>/g)) {
      assert.match(m[1], /^h[12]$/, `${nome}: <${m[1]}> fora da ordem de foco`);
      assert.match(m[0], /data-titulo-da-tela/);
    }
    // Nada focavel escondido do leitor de tela.
    assert.doesNotMatch(html, /<(button|input|a)\s[^>]*aria-hidden="true"/, `${nome}: controle com aria-hidden`);
    // Todo link leva a algum lugar; todo botao tem nome.
    for (const a of elementos(html, "a")) assert.ok(a.href, `${nome}: link sem href`);
    for (const m of html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)) {
      const nomeDoBotao = atributos(m[0]).hasOwnProperty("aria-label") ? atributos(m[0])["aria-label"] : textoDe(m[2]);
      assert.ok(nomeDoBotao.trim(), `${nome}: botao sem nome: ${m[0].slice(0, 80)}`);
    }
  }

  // OCUPADO SEM PERDER O FOCO: quem espera resposta continua focavel -
  // `aria-disabled`, e nao `disabled` (que tira o foco e o joga no <body>).
  const assistenteOcupado = renderizar("AssistantPage", { ...propsDoAssistente([]), assistantLoading: true });
  const campo = elementos(assistenteOcupado, "input").find((i) => i.id === "assistant-question");
  assert.equal(campo["aria-disabled"], "true");
  assert.ok("readonly" in campo, "o campo ocupado precisa ser so leitura");
  assert.equal("disabled" in campo, false, "campo ocupado com disabled perde o foco");
  assert.doesNotMatch(assistenteOcupado, /<button[^>]*\sdisabled=""/);

  const comparando = renderizar("ComparePage", { ...propsDaComparacao({}), comparacao: { ...propsDaComparacao({}).comparacao, carregando: true } });
  assert.match(comparando, /<button class="primary-button" type="submit" aria-disabled="true">Comparando\.\.\.<\/button>/);
  assert.doesNotMatch(comparando, /\sdisabled=""/);

  const buscando = renderizar("ScannerPage", propsDaCamera({ status: { type: "loading", message: "Procurando..." } }));
  assert.match(buscando, /<button type="submit" aria-label="Buscar código" aria-disabled="true">/);
  assert.doesNotMatch(buscando, /\sdisabled=""/);

  // O botao da camera e UM elemento nos dois estados: ligar e desligar nao
  // trocam o botao focado por outro.
  const parada = renderizar("ScannerPage", propsDaCamera());
  const lendo = renderizar("ScannerPage", propsDaCamera({ scannerState: "scanning" }));
  const primeiroBotao = (html) => html.slice(html.indexOf('<div class="scan-actions">')).match(/<button[^>]*>/)[0];
  assert.match(primeiroBotao(parada), /type="button"/);
  assert.match(primeiroBotao(lendo), /type="button"/);
  assert.match(textoDe(parada), /Ligar câmera/);
  assert.match(textoDe(lendo), /Desligar câmera/);

  // A lista de alergias abre e fecha por um botao que diz o estado.
  const alergias = renderizar("AllergyPicker", { selectedAllergies: [], onToggleAllergy: () => {} });
  const alternar = elementos(alergias, "button").find((b) => b.class === "allergy-picker-toggle");
  assert.equal(alternar["aria-expanded"], "false");
  assert.ok(porId(alergias, alternar["aria-controls"]) || alergias.includes(`id="${alternar["aria-controls"]}"`));
});

// ---------------------------------------------------------------------------
// A9t - FOCO VISIVEL, COM CONTRASTE, NAO REMOVIDO POR CSS (2.4.7, 1.4.11)
// ---------------------------------------------------------------------------

// Quem tira o anel do proprio campo e onde ele volta.
const FOCO_DEVOLVIDO = {
  ".input-row input:focus-visible": ".input-row input:focus-visible",
  ".field-with-icon input:focus-visible": ".field-with-icon input:focus-visible",
  ".assistant-form input:focus-visible": ".assistant-form input:focus-visible",
  ".allergy-picker-field input": ".allergy-picker-field:focus-within",
  ".topbar-search input": ".topbar-search:focus-within",
};

function anelVisivel(valor) {
  if (!valor) return false;
  const v = valor.toLowerCase();
  if (/\bnone\b|^0(px)?\b|\b0px\b solid|transparent/.test(v)) return false;
  const largura = v.match(/([\d.]+)px/);
  return Boolean(largura) && Number(largura[1]) >= 2 && /solid|auto|double|dashed|dotted/.test(v);
}

test("A9t o anel de foco existe, tem 2px e nenhum campo do caminho o perde", { skip: semEsbuild }, () => {
  const regras = todasAsRegras();
  // O anel global.
  assert.ok(anelVisivel(declarado(regras, ":focus-visible", "outline")), "o anel global sumiu");

  // Toda regra que zera o outline precisa estar na lista, com o anel devolvido
  // DEPOIS, no mesmo seletor ou no da caixa que envolve o campo.
  const zerados = regras.filter((r) => !r.media && /^(none|0)\b/.test(r.declaracoes.outline ?? ""));
  for (const regra of zerados) {
    for (const seletor of regra.seletores) {
      assert.ok(seletor in FOCO_DEVOLVIDO, `${seletor} tira o anel de foco e ninguem o devolve`);
      const devolvido = declarado(regras, FOCO_DEVOLVIDO[seletor], "outline");
      assert.ok(anelVisivel(devolvido), `${seletor}: o anel nao volta em ${FOCO_DEVOLVIDO[seletor]} (${devolvido})`);
    }
  }
  // O campo da comparacao, que nao zera nada, tambem tem o anel declarado.
  assert.ok(anelVisivel(declarado(regras, ".compare-field input:focus-visible", "outline")));
  // Nenhum outline zerado dentro de @media.
  assert.equal(regras.some((r) => r.media && /^(none|0)\b/.test(r.declaracoes.outline ?? "")), false);

  // A arvore renderizada nao traz estilo inline que esconda o foco.
  for (const [nome, html] of Object.entries(telasDoCaminho())) {
    assert.doesNotMatch(html, /style="[^"]*outline/, `${nome}: outline inline`);
  }
  // O contraste do anel esta na tabela do A3t ("anel de foco sobre ...").
});

// ---------------------------------------------------------------------------
// A10 - FOCO NAO ESCONDIDO ATRAS DE BARRA FIXA (2.4.11)
// ---------------------------------------------------------------------------

// Alturas MEDIDAS no navegador, no build real (v0.12.0, AUDIT_REPORT): a barra
// de cima e a unica com altura de conteudo, que o CSS sozinho nao da.
const BARRA_DE_CIMA_CELULAR_PX = 145;
const BARRA_DE_CIMA_COMPUTADOR_PX = 93;
const MEDIA_DO_COMPUTADOR = "@media (min-width: 960px)";

test("A10 a folga de rolagem cobre a barra de cima e as abas, no celular e no computador", () => {
  const regras = todasAsRegras();
  const mapa = tokens(regras);
  // As barras continuam grudadas: se deixarem de ser, a folga sobra e e so isso.
  assert.equal(declarado(regras, ".topbar", "position"), "sticky");
  assert.equal(declarado(regras, ".tabbar", "position"), "fixed");
  const abas = px(declarado(regras, ".tabbar", "height"), mapa);
  assert.equal(abas, 76);

  // Celular.
  const topo = px(declarado(regras, "html", "scroll-padding-top"), mapa);
  const base = px(declarado(regras, "html", "scroll-padding-bottom"), mapa);
  assert.ok(topo >= BARRA_DE_CIMA_CELULAR_PX, `folga de cima ${topo}px < barra ${BARRA_DE_CIMA_CELULAR_PX}px`);
  assert.ok(base >= abas, `folga de baixo ${base}px < abas ${abas}px`);
  assert.match(declarado(regras, "html", "scroll-padding-bottom"), /safe-area-inset-bottom/, "a folga ignora o recorte do iPhone");

  // Computador: a folga menor vale EXATAMENTE onde as abas somem.
  assert.equal(declarado(regras, ".tabbar", "display", { media: MEDIA_DO_COMPUTADOR }), "none");
  const topoGrande = px(
    declarado(regras, "html", "--folga-do-topo", { media: MEDIA_DO_COMPUTADOR }) ?? declarado(regras, "html", "scroll-padding-top", { media: MEDIA_DO_COMPUTADOR }),
    mapa,
  );
  assert.ok(topoGrande >= BARRA_DE_CIMA_COMPUTADOR_PX, `folga de cima no computador ${topoGrande}px`);
  assert.ok(px(declarado(regras, "html", "scroll-padding-bottom", { media: MEDIA_DO_COMPUTADOR }), mapa) >= 0);
  // Fora dessas duas faixas, nenhuma outra regra mexe na folga.
  const outras = regras.filter((r) => r.seletores.includes("html") && r.media && r.media !== MEDIA_DO_COMPUTADOR && /scroll-padding|--folga/.test(Object.keys(r.declaracoes).join()));
  assert.deepEqual(outras, []);
});

// ---------------------------------------------------------------------------
// A11 - ALVO DE TOQUE >= 24x24 (2.5.8)
// ---------------------------------------------------------------------------

// Cada alvo do caminho do alerta e a cadeia de seletores que da o tamanho dele,
// do mais geral ao mais especifico. `lados`: o que precisa ter 24px declarado.
const ALVOS = [
  { nome: "Ligar/Desligar câmera, Comparar, Escanear", cadeia: [".primary-button", ".secondary-button"], lados: ["altura"] },
  { nome: "Abrir este produto (comparação)", cadeia: [".secondary-button", ".compare-col .secondary-button"], lados: ["altura"] },
  { nome: "botões da comparação", cadeia: [".compare-actions button"], lados: ["altura"] },
  { nome: "Buscar / Buscar código (só ícone na câmera)", cadeia: [".input-row button"], lados: ["altura", "padding"] },
  { nome: "Perguntar ao assistente (só ícone)", cadeia: [".assistant-form button"], lados: ["altura", "padding"] },
  { nome: "sugestão de pergunta", cadeia: [".prompt-suggestions button"], lados: ["altura"] },
  { nome: "Meus produtos (comparação)", cadeia: [".chip-list button"], lados: ["altura"] },
  { nome: "Tentar de novo", cadeia: [".retry-button"], lados: ["altura"] },
  { nome: "aba de navegação", cadeia: [".tab-item"], lados: ["altura"] },
  { nome: "conta (topo, só ícone)", cadeia: [".topbar-account"], lados: ["altura", "largura"] },
  { nome: "linha de alergia e de alerta máximo (o rótulo é o alvo)", cadeia: [".check-row"], lados: ["altura"] },
  { nome: "remover alergia (×)", cadeia: [".allergy-chip-remove"], lados: ["altura", "largura"] },
  { nome: "abrir lista de alergias", cadeia: [".allergy-picker-toggle"], lados: ["altura", "largura"] },
  { nome: "campo de busca/código", cadeia: [".input-row input"], lados: ["altura"] },
  { nome: "campo da pergunta", cadeia: [".assistant-form input"], lados: ["altura"] },
  { nome: "campo da comparação", cadeia: [".compare-field input"], lados: ["altura"] },
  { nome: "campo de buscar alergia", cadeia: [".allergy-picker-field input"], lados: ["altura"] },
  { nome: "busca do topo", cadeia: [".topbar-search"], lados: ["altura"] },
];

function ultimoDeclarado(regras, cadeia, props) {
  let valor;
  for (const regra of regras) {
    if (regra.media) continue;
    if (!regra.seletores.some((s) => cadeia.includes(s))) continue;
    for (const prop of props) if (prop in regra.declaracoes) valor = regra.declaracoes[prop];
  }
  return valor;
}

test("A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais", (t) => {
  const regras = todasAsRegras();
  const mapa = tokens(regras);
  const pequenos = [];
  for (const alvo of ALVOS) {
    for (const lado of alvo.lados) {
      let medida;
      if (lado === "altura") {
        const altura = px(ultimoDeclarado(regras, alvo.cadeia, ["height"]) ?? "0", mapa);
        const minima = px(ultimoDeclarado(regras, alvo.cadeia, ["min-height"]) ?? "0", mapa);
        medida = Math.max(altura || 0, minima || 0);
      } else if (lado === "largura") {
        medida = Math.max(px(ultimoDeclarado(regras, alvo.cadeia, ["width"]) ?? "0", mapa) || 0, px(ultimoDeclarado(regras, alvo.cadeia, ["min-width"]) ?? "0", mapa) || 0);
      } else {
        // Botao so de icone: a largura e o padding dos dois lados mais o icone.
        const padding = resolver(ultimoDeclarado(regras, alvo.cadeia, ["padding"]) ?? "0", mapa).split(/\s+/);
        const horizontal = px(padding[1] ?? padding[0], mapa);
        medida = 2 * horizontal;
      }
      t.diagnostic(`${alvo.nome} - ${lado}: ${medida}px`);
      if (!(medida >= 24)) pequenos.push(`${alvo.nome} (${lado}): ${medida}px`);
    }
  }
  assert.deepEqual(pequenos, [], `alvos abaixo de 24px:\n${pequenos.join("\n")}`);
  // Nenhum @media encolhe um alvo da lista para baixo de 24px.
  for (const regra of regras.filter((r) => r.media)) {
    if (!regra.seletores.some((s) => ALVOS.some((a) => a.cadeia.includes(s)))) continue;
    for (const prop of ["height", "min-height", "width"]) {
      if (prop in regra.declaracoes) {
        const valor = px(regra.declaracoes[prop], mapa);
        if (!Number.isNaN(valor)) assert.ok(valor >= 24, `${regra.seletores} ${prop} ${valor}px em ${regra.media}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// A12 - CAMPO DE CODIGO COM <label> ASSOCIADO (1.3.1, 3.3.2)
// ---------------------------------------------------------------------------

function rotuloDe(html, campo) {
  if (campo.id) {
    const m = html.match(new RegExp(`<label[^>]*\\sfor="${campo.id}"[^>]*>([\\s\\S]*?)</label>`));
    if (m) return textoDe(m[1]);
  }
  // Campo dentro do proprio <label>.
  const antes = html.slice(0, campo._pos);
  const abre = antes.lastIndexOf("<label");
  if (abre >= 0 && antes.lastIndexOf("</label>") < abre) {
    const fim = html.indexOf("</label>", campo._pos);
    return textoDe(html.slice(abre, fim));
  }
  return null;
}

test("A12 os campos do caminho do alerta tem <label> visivel associado", { skip: semEsbuild }, () => {
  const camera = renderizar("ScannerPage", propsDaCamera());
  const codigo = elementos(camera, "input").find((i) => i.id === "barcode-page");
  assert.equal(rotuloDe(camera, codigo), "Ou digite o código");

  const busca = renderizar("SearchPage", propsDaBusca());
  const campoDaBusca = elementos(busca, "input").find((i) => i.id === "food-search-page");
  assert.equal(rotuloDe(busca, campoDaBusca), "Alimento ou código");

  const assistente = renderizar("AssistantPage", propsDoAssistente([]));
  const pergunta = elementos(assistente, "input").find((i) => i.id === "assistant-question");
  assert.equal(rotuloDe(assistente, pergunta), "Sua pergunta");

  const comparacao = renderizar("ComparePage", propsDaComparacao({}));
  const rotulos = elementos(comparacao, "input").map((campo) => rotuloDe(comparacao, campo));
  assert.deepEqual(rotulos, ["Primeiro produto (código)", "Segundo produto (código)"]);

  // O filtro do seletor de alergias e um campo de busca com lupa: o nome
  // acessivel contem o texto visivel (2.5.3), e nao ha campo sem nome.
  const alergias = renderizar("AllergyPicker", { selectedAllergies: [], onToggleAllergy: () => {} });
  const filtro = elementos(alergias, "input").find((i) => i.type === "search");
  assert.ok(filtro["aria-label"].startsWith(filtro.placeholder), "o nome acessivel nao contem o texto visivel");
  for (const campo of elementos(alergias, "input").filter((i) => i.type === "checkbox")) {
    assert.ok(rotuloDe(alergias, campo), "caixa de alergia sem rotulo");
  }
});

// ---------------------------------------------------------------------------
// A13 - OS QUATRO MOTIVOS DE RECUSA CHEGAM AO LEITOR DE TELA (3.3.1, 3.3.3, 4.1.3)
// ---------------------------------------------------------------------------

const ENTRADAS_RECUSADAS = { vazio: "", caractere: "12a45678", tamanho: "1234567", digito: "3017624010702" };

test("A13 cada motivo de recusa e distinto, ligado ao campo e anunciado uma vez", { skip: semEsbuild }, () => {
  const mensagens = {};
  for (const [motivo, entrada] of Object.entries(ENTRADAS_RECUSADAS)) {
    const resultado = validarCodigoDeBarras(entrada);
    assert.equal(resultado.valido, false, `${motivo}: a entrada foi aceita`);
    mensagens[motivo] = mensagemDeRecusa(resultado);
  }
  assert.equal(new Set(Object.values(mensagens)).size, 4, "dois motivos com a mesma mensagem");

  for (const [motivo, mensagem] of Object.entries(mensagens)) {
    // Tela da camera, entrada manual.
    const camera = renderizar("ScannerPage", propsDaCamera({ query: ENTRADAS_RECUSADAS[motivo], status: { type: "warning", message: mensagem } }));
    const campo = elementos(camera, "input").find((i) => i.id === "barcode-page");
    const descritores = campo["aria-describedby"].split(/\s+/);
    const erro = descritores.map((id) => porId(camera, id)).find((d) => d && /role="alert"/.test(d.abertura));
    assert.ok(erro, `${motivo}: o erro nao esta ligado ao campo`);
    assert.equal(erro.texto, mensagem, `${motivo}: o campo descreve outra coisa`);
    assert.equal(campo["aria-invalid"], "true");
    // Anunciado UMA vez: com o erro no campo, a linha de status cala.
    assert.equal((camera.match(/role="alert"/g) ?? []).length, 1);
    assert.doesNotMatch(camera, /role="status"/, `${motivo}: a recusa seria lida duas vezes`);
    assert.match(camera, /class="status-line warning" aria-live="off"/);

    // Tela de busca: a recusa do codigo tambem fica no campo.
    const busca = renderizar("SearchPage", propsDaBusca({ status: { type: "warning", message: mensagem, campo: true } }));
    const campoDaBusca = elementos(busca, "input").find((i) => i.id === "food-search-page");
    assert.equal(campoDaBusca["aria-invalid"], "true");
    const erroDaBusca = porId(busca, campoDaBusca["aria-describedby"]);
    assert.match(erroDaBusca.abertura, /role="alert"/);
    assert.equal(erroDaBusca.texto, mensagem);
    assert.doesNotMatch(busca, /role="status"/);
  }

  // "Nao encontrado" e resultado, nao erro de digitacao: nada de campo invalido.
  const naoAchou = renderizar("SearchPage", propsDaBusca({ status: { type: "warning", message: "Nenhum produto com esse nome." } }));
  assert.doesNotMatch(naoAchou, /aria-invalid|role="alert"/);
  assert.match(naoAchou, /role="status" aria-live="polite"/);
});

// ---------------------------------------------------------------------------
// A14 - SELETOR DE ALERGIAS E NIVEL DE ALERTA COM ROTULO E ESTADO (4.1.2, 1.3.1)
// ---------------------------------------------------------------------------

test("A14 cada alergia e cada nivel de alerta tem nome e estado acessiveis", { skip: semEsbuild }, () => {
  const alergias = renderizar("AllergyPicker", { selectedAllergies: ["milk"], onToggleAllergy: () => {} });
  const caixas = elementos(alergias, "input").filter((i) => i.type === "checkbox");
  assert.ok(caixas.length >= 14, "a lista de alergias encolheu");
  const marcadas = caixas.filter((c) => "checked" in c).map((c) => rotuloDe(alergias, c));
  assert.deepEqual(marcadas, ["Leite/lactose"], "o estado marcado nao chega");
  for (const caixa of caixas) assert.ok(rotuloDe(alergias, caixa)?.trim(), "caixa sem nome");
  // A etiqueta da alergia escolhida tem botao de remover com nome.
  assert.ok(elementos(alergias, "button").some((b) => b["aria-label"] === "Remover Leite/lactose"));
  // A lista e um grupo com nome; os grupos internos tem titulo.
  assert.match(alergias, /role="group" aria-label="Todas as alergias"/);

  const nivel = renderizar("AlertLevelPicker", {
    selectedAllergies: ["milk", "peanut"],
    alertLevels: { milk: "strict", peanut: "standard" },
    onSetAlertLevel: () => {},
  });
  const [secao] = elementos(nivel, "section");
  assert.equal(porId(nivel, secao["aria-labelledby"]).texto, "Alerta máximo");
  const niveis = elementos(nivel, "input").map((c) => ({ nome: rotuloDe(nivel, c), marcado: "checked" in c }));
  assert.deepEqual(niveis, [
    { nome: "Alerta máximo para Leite/lactose", marcado: true },
    { nome: "Alerta máximo para Amendoim", marcado: false },
  ]);
  // O titulo do nivel fica no nivel certo: h3 na tela de Alergias.
  assert.match(nivel, /<h3 id="[^"]+" class="alert-level-title">Alerta máximo<\/h3>/);
});

// ---------------------------------------------------------------------------
// A15 - PREFERS-REDUCED-MOTION (2.3.3)
// ---------------------------------------------------------------------------

test("A15 com movimento reduzido, nada anima; a camera nao depende de animacao", { skip: semEsbuild }, () => {
  const regras = todasAsRegras();
  const reduzido = regras.filter((r) => r.media === "@media (prefers-reduced-motion: reduce)");
  const universal = reduzido.find((r) => r.seletores.includes("*"));
  assert.ok(universal, "sem regra de movimento reduzido para tudo");
  assert.match(universal.declaracoes["animation-duration"], /0\.01ms !important/);
  assert.match(universal.declaracoes["animation-iteration-count"], /1 !important/);
  assert.match(universal.declaracoes["transition-duration"], /0\.01ms !important/);
  assert.match(universal.declaracoes["scroll-behavior"], /auto !important/);
  // Toda animacao declarada esta coberta pela regra universal (nenhuma usa
  // seletor que escape de `*`, como ::marker ou animacao em pseudo nao listado).
  assert.deepEqual(universal.seletores.sort(), ["*", "*::after", "*::before"]);

  // A camera: o estado chega por TEXTO, nao pelo giro do icone.
  const lendo = renderizar("ScannerPage", propsDaCamera({ scannerState: "scanning", status: { type: "loading", message: "Procurando o código..." } }));
  assert.match(textoDe(lendo), /Desligar câmera/);
  assert.match(textoDe(lendo), /Procurando o código\.\.\./);
  // O icone que gira e decorativo.
  for (const m of lendo.matchAll(/<svg[^>]*class="[^"]*spin[^"]*"[^>]*>/g)) assert.match(m[0], /aria-hidden="true"/);
});

// ---------------------------------------------------------------------------
// A16 - IDIOMA, CABECALHOS E LANDMARKS (3.1.1, 1.3.1)
// ---------------------------------------------------------------------------

function niveisDeCabecalho(html) {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
}

function semPulo(niveis) {
  for (let i = 1; i < niveis.length; i += 1) {
    if (niveis[i] > niveis[i - 1] + 1) return `h${niveis[i - 1]} -> h${niveis[i]}`;
  }
  return null;
}

test("A16 lang pt-BR, cabecalhos sem pular nivel e landmarks", { skip: semEsbuild }, () => {
  assert.match(fonte("index.html"), /<html lang="pt-BR">/);

  const app = renderizar("App");
  assert.equal((app.match(/<main[\s>]/g) ?? []).length, 1);
  assert.match(app, /<main[^>]*id="conteudo"/);
  assert.match(app, /<header class="topbar"/);
  assert.match(app, /<nav[^>]*aria-label="[^"]+"/);
  assert.match(app, /<a class="skip-link" href="#conteudo">/);

  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  const paginas = {
    // A Home, no app inteiro.
    inicio: app.slice(app.indexOf("<main")),
    busca: renderizar("SearchPage", propsDaBusca({ productAnalysis: telas.h(telas.tela("ProductAnalysis"), propsDoProduto(PRODUTO_LEITE, ["milk"])) })),
    camera: renderizar("ScannerPage", propsDaCamera()),
    assistente: renderizar("AssistantPage", propsDoAssistente([])),
    comparacao: renderizar("ComparePage", propsDaComparacao({ resultado: comparacao })),
  };
  for (const [nome, html] of Object.entries(paginas)) {
    const niveis = niveisDeCabecalho(html);
    assert.equal(niveis[0], 1, `${nome}: a tela nao comeca em h1 (${niveis.join(",")})`);
    assert.equal(niveis.filter((n) => n === 1).length, 1, `${nome}: mais de um h1`);
    assert.equal(semPulo(niveis), null, `${nome}: pula nivel (${niveis.join(",")})`);
  }
  // Na tela de Alergias, o seletor fica abaixo do h2 da tela: grupos em h3.
  const alergias = renderizar("AllergyPicker", { selectedAllergies: [], onToggleAllergy: () => {} });
  assert.deepEqual([...new Set(niveisDeCabecalho(alergias))], [3]);
  // Na Conta, o mesmo seletor desce para h5, abaixo do h4 do cartao.
  const naConta = renderizar("AllergyPicker", { selectedAllergies: [], onToggleAllergy: () => {}, TituloDoGrupo: "h5" });
  assert.deepEqual([...new Set(niveisDeCabecalho(naConta))], [5]);
});

// ---------------------------------------------------------------------------
// A17 - TEXTO DA OPEN FOOD FACTS NAO E INJETADO COMO HTML (seguranca + 4.1.1)
// ---------------------------------------------------------------------------

const NOME_MALICIOSO = '<img src=x onerror=alert(1)>" aria-hidden="true';

test("A17 nome de produto vindo da Open Food Facts chega como texto, nunca como HTML", { skip: semEsbuild }, () => {
  const veredito = renderizar("AllergyVerdict", { verdict: VEREDITOS.conflito, rotulo: NOME_MALICIOSO });
  const produto = renderizar("ProductAnalysis", propsDoProduto({ ...PRODUTO_LEITE, product_name: NOME_MALICIOSO }, ["milk"]));
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: NOME_MALICIOSO, ingredients_text: "leite" } },
      { code: "0036000291452", product: { product_name: "Arroz", ingredients_text: "arroz" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  const tela = renderizar("ComparePage", propsDaComparacao({ resultado: comparacao }));
  const anuncio = renderizar("AnuncioDoVeredito", { texto: telas.estado.anuncioDoProduto(NOME_MALICIOSO, VEREDITOS.conflito), vez: 1 });

  for (const [nome, html] of Object.entries({ veredito, produto, tela, anuncio })) {
    assert.doesNotMatch(html, /<img src=x/, `${nome}: o nome virou HTML`);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, `${nome}: o nome nao chegou escapado`);
    // Nem no atributo: a aspa do nome nao fecha o aria-label da coluna.
    assert.doesNotMatch(html, /aria-hidden="true"" /);
  }
  // O aria-label da coluna leva o nome escapado - e o nome inteiro.
  const [coluna] = elementos(tela, "article");
  assert.equal(coluna["aria-label"], "Primeiro produto: &lt;img src=x onerror=alert(1)&gt;&quot; aria-hidden=&quot;true");

  // Complemento (fonte): nenhum componente do app escreve HTML cru.
  const cru = arquivosDe("src").filter((arquivo) => /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/.test(fonte(arquivo)));
  assert.deepEqual(cru, []);
});

function arquivosDe(relativo) {
  const saida = [];
  for (const nome of readdirSync(path.join(rootDir, relativo))) {
    const caminho = path.join(relativo, nome);
    if (statSync(path.join(rootDir, caminho)).isDirectory()) saida.push(...arquivosDe(caminho));
    else if (/\.(jsx?|mjs)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// R1..R7 - REGRESSAO
// ---------------------------------------------------------------------------
//
// Cada R abaixo executa o comportamento de novo, pelo codigo real, no mesmo
// processo destes testes. As suites completas de cada um continuam no gate
// (`npm --prefix backend test`) e estao citadas no comentario de cada R.

// R1 - exploit C1 (allergyVerdict.test.js T1..T8).
test("R1 regressao: exploit C1 - o modelo negando o conflito nao entrega falso seguro", async () => {
  const resposta = await answerAssistantChat(
    { user: null },
    {
      message: "Posso consumir esse produto?",
      conversation: [],
      product: { name: "Leite em Po Integral", ingredients_text: "leite em po integral, vitaminas", allergens: ["milk"] },
      guestAllergies: ["milk"],
    },
    {
      messages: {
        create: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ answer: "Este produto NAO contem leite e e totalmente seguro.", category: "allergy", safety: "normal", usedProductContext: true }) }],
        }),
      },
    },
    { logger: { warn: () => {} } },
  );
  assert.equal(resposta.safety, "caution");
  assert.equal(resposta.allergyVerdict.status, "conflict");
  assert.deepEqual(resposta.allergyVerdict.conflicts.map((r) => r.id), ["milk"]);
  assert.equal(resposta.allergyVerdict.source, "deterministic_engine");
});

// R2 - matriz de severidade (alertLevel.test.js S1..S4, offline.test.js O5).
test("R2 regressao: matriz de severidade nos quatro casos", () => {
  const declarado = { name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };
  const traco = { name: "Biscoito de arroz", ingredients_text: "farinha de arroz, oleo vegetal, sal", traces: ["peanuts"] };
  const veredito = (produto, nivel) => {
    const snap = buildAssistantContext({ product: produto, allergies: ["peanut"] }).allergySnapshot;
    return buildAllergyVerdict({ profileRisks: snap.profileRisks, profileAllergies: snap.profileAllergies, hasProductContext: snap.hasProductContext, alertLevels: { peanut: nivel } });
  };
  const casos = [
    [declarado, "standard", "conflict", "caution"],
    [declarado, "strict", "conflict", "urgent"],
    [traco, "strict", "conflict", "caution"],
    [traco, "standard", "traces", null],
  ];
  for (const [produto, nivel, status, piso] of casos) {
    const v = veredito(produto, nivel);
    assert.equal(v.status, status, `${produto.name}/${nivel}`);
    assert.equal(v.minimumSafety, piso, `${produto.name}/${nivel}`);
  }
});

// R3 - comparacao sem contaminacao (comparison.test.js C1t..C7t).
test("R3 regressao: comparacao sem contaminacao, explicacao amarrada pelo codigo", () => {
  const perfil = { profileAllergies: ["milk"], alertLevels: {} };
  const leite = { product_name: "Leite em po", ingredients_text: "leite em po integral" };
  const arroz = { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" };
  const comparacao = compareProducts([{ code: "7891000100103", product: leite }, { code: "0036000291452", product: arroz }], perfil);
  assert.equal(comparacao.products[0].allergyVerdict.status, "conflict");
  assert.equal(comparacao.products[1].allergyVerdict.status, "clear");
  assert.equal("allergyVerdict" in comparacao, false, "existe veredito 'da comparacao'");
  // Explicacoes em ordem trocada caem no produto certo, pelo codigo.
  const porCodigo = amarrarExplicacoes(
    [
      { productCode: "0036000291452", explanation: "TEXTO-DO-ARROZ" },
      { productCode: "7891000100103", explanation: "TEXTO-DO-LEITE" },
    ],
    comparacao.products,
  );
  assert.equal(porCodigo.get("7891000100103").explanation, "TEXTO-DO-LEITE");
  assert.equal(porCodigo.get("0036000291452").explanation, "TEXTO-DO-ARROZ");
  // Codigo que nao e de nenhum dos dois derruba a resposta - nao vira palpite.
  assert.throws(() => amarrarExplicacoes([{ productCode: "0036000291452" }, { productCode: "5449000000996" }], comparacao.products));
});

// R4 - cache offline sem veredito, logout limpando (offline.test.js O3, O9).
test("R4 regressao: o cache offline nao guarda veredito e o logout o limpa", async () => {
  const fabrica = new IDBFactory();
  const cache = criarCacheOffline({ indexedDB: fabrica, agora: () => Date.UTC(2026, 9, 16), alergiasValidas: VALID_ALLERGY_IDS });
  const conta = { id: "conta-r4", name: "R4", email: "r4@example.test", allergies: ["peanut"], alertLevels: { peanut: "strict" } };
  await aoConfirmarConta(conta, { cache });
  await guardarProdutoVisto(conta.id, {
    code: "7896000000019",
    product_name: "Pacoca R4",
    ingredients_text: "amendoim",
    allergyVerdict: { status: "clear" },
    safety: "normal",
  }, { cache });
  const cru = async () => {
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
  };
  const antes = await cru();
  assert.match(antes, /Pacoca R4/);
  assert.doesNotMatch(antes, /allergyVerdict|"safety"/);
  // O veredito lido do aparelho e refeito com o perfil de agora.
  assert.equal(avaliarNoAparelho({ product_name: "Pacoca R4", ingredients_text: "amendoim" }, { profileAllergies: ["peanut"] }).allergyVerdict.status, "conflict");
  await aoSairDaConta({ sair: async () => {}, cache });
  const depois = await cru();
  for (const vestigio of ["Pacoca R4", "peanut", "conta-r4"]) assert.equal(depois.includes(vestigio), false, `sobrou ${vestigio}`);
});

async function comServidor(app, callback) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// R5 - isolamento, exportacao, exclusao (account.test.js E6..E8,
// accountIntegration.test.js E1..E5 com PostgreSQL).
test("R5 regressao: sem sessao, exportar, excluir e ler colecoes respondem 401", async () => {
  await comServidor(createApp(), async (base) => {
    const exportar = await fetch(`${base}/api/account/export`);
    assert.equal(exportar.status, 401);
    const excluir = await fetch(`${base}/api/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "qualquer" }),
    });
    assert.equal(excluir.status, 401);
    // Id de outra pessoa na query nao vira identidade.
    const historico = await fetch(`${base}/api/history?userId=1`);
    assert.equal(historico.status, 401);
  });
});

// R6 - digito verificador, canonicalizacao, tetos (barcode.test.js M1..M9,
// comparison.test.js C15).
test("R6 regressao: digito verificador, UPC-A canonicalizado e tetos da comparacao", () => {
  assert.equal(validarCodigoDeBarras("7891000100103").valido, true);
  assert.equal(validarCodigoDeBarras("7891000100104").valido, false);
  const upca = validarCodigoDeBarras("036000291452");
  assert.equal(upca.valido, true);
  assert.equal(upca.codigo, "0036000291452");
  assert.equal(TETO_COMPARACAO_POR_USUARIO, 30);
  assert.equal(TETO_COMPARACAO_POR_IP, 300);
  assert.equal(criarLimitadoresDeComparacao().length, 2, "a comparacao perdeu um dos dois limitadores");
});

// R7 - handler de erro e fail-closed (bodyParseError.test.js O2a..O2c,
// productionHardening.test.js P5).
test("R7 regressao: JSON malformado e 400 sem detalhe; erro de rota desconhecida e 404 de API", async () => {
  await comServidor(createApp(), async (base) => {
    const resposta = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{nao-e-json",
    });
    assert.equal(resposta.status, 400);
    const texto = await resposta.text();
    assert.equal(JSON.parse(texto).error.code, "INVALID_JSON");
    assert.doesNotMatch(texto, /SyntaxError|Unexpected token|\n\s+at /);
    const inexistente = await fetch(`${base}/api/nao-existe`);
    assert.equal(inexistente.status, 404);
    assert.match(inexistente.headers.get("content-type") ?? "", /json/);
  });
});

// ---------------------------------------------------------------------------
// Props das telas
// ---------------------------------------------------------------------------

const PRODUTO_LEITE = {
  code: "7891000100103",
  product_name: "Leite em po",
  brands: "Marca L",
  ingredients_text: "leite em po integral",
  allergens_tags: ["en:milk"],
};

function propsDoProduto(produto, alergias) {
  const { scan, allergyVerdict } = avaliarNoAparelho(produto, { profileAllergies: alergias });
  return {
    product: { ...produto, source: "Open Food Facts", isLocal: false },
    localMatches: [],
    nutrientRows: [],
    allergyScan: scan,
    alertLevels: {},
    productScore: { tone: "danger", label: "Atenção", notes: [] },
    onSelectProduct: () => {},
    veredito: allergyVerdict,
  };
}

function propsDoAssistente(mensagens) {
  return {
    chatLogRef: { current: null },
    assistantConnection: { type: "success", message: "Nutri IA respondeu." },
    assistantMessages: mensagens,
    assistantLoading: false,
    assistantQuestion: "",
    hasLastQuestion: false,
    onQuestionChange: () => {},
    onSubmitAssistant: () => {},
    onRetryAssistant: () => {},
  };
}

function propsDaComparacao({ resultado = null, parcial = null }) {
  return {
    comparacao: {
      entradaA: "7891000100103",
      entradaB: "0036000291452",
      carregando: false,
      mensagem: null,
      resultado,
      parcial,
      explicando: false,
    },
    opcoesMeusProdutos: [{ codigo: "5449000000996", nome: "Refrigerante" }],
    onChangeEntrada: () => {},
    onEscolher: () => {},
    onEscanear: () => {},
    onComparar: () => {},
    onExplicar: () => {},
    onAbrirProduto: () => {},
  };
}

function propsDaCamera(sobrescritas = {}) {
  return {
    query: "",
    status: { type: "ready", message: "Pronto para ler." },
    scannerState: "idle",
    videoRef: { current: null },
    productAnalysis: null,
    torch: { available: false, on: false },
    onQueryChange: () => {},
    onSubmitSearch: () => {},
    onStartScanner: () => {},
    onStopScanner: () => {},
    onToggleTorch: () => {},
    ...sobrescritas,
  };
}

function propsDaBusca(sobrescritas = {}) {
  return {
    query: "",
    status: { type: "ready", message: "Digite um alimento." },
    productAnalysis: null,
    onQueryChange: () => {},
    onSubmitSearch: () => {},
    onSearchProduct: () => {},
    ...sobrescritas,
  };
}
