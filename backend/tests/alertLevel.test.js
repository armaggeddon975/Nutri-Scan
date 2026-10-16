import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { answerAssistantChat, resetMinimizationAttempts } from "../src/ai/assistantService.js";
import { buildAssistantContext } from "../src/ai/contextBuilder.js";
import { toPublicUser } from "../src/utils/normalize.js";
import { validateAllergiesUpdate } from "../src/utils/validation.js";
import {
  ALERT_LEVEL_VALUES,
  applyAllergyAuthority,
  buildAllergyVerdict,
  conflictOrigin,
  CONFLICT_MINIMUM_SAFETY,
  STRICT_CONFLICT_MINIMUM_SAFETY,
  VERDICT_ORIGIN,
} from "../../shared/allergyVerdict.js";

// v0.9.0 - nivel de alerta por alergia ("alerta maximo"), sem banco.
//
// O que o prompt chama de SEVERIDADE e, no codigo, `alertLevel`:
//   standard  o nivel PADRAO - comportamento da v0.8.0, byte a byte
//   strict    o nivel GRAVE  - "alerta maximo" na tela
// Os testes com PostgreSQL real estao em `alertLevelIntegration.test.js`.

const rootDir = path.resolve(import.meta.dirname, "..", "..");

const PRODUTO_DECLARADO = { name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };
const PRODUTO_TRACO = {
  name: "Biscoito de arroz",
  ingredients_text: "farinha de arroz, oleo vegetal, sal",
  traces: ["peanuts"],
};
const PRODUTO_MISTO = {
  name: "Biscoito",
  ingredients_text: "farinha de trigo, acucar, leite em po",
  traces: ["peanuts"],
};

function veredito(produto, perfil, alertLevels) {
  const snap = buildAssistantContext({ product: produto, allergies: perfil }).allergySnapshot;
  return buildAllergyVerdict({
    profileRisks: snap.profileRisks,
    profileAllergies: snap.profileAllergies,
    hasProductContext: snap.hasProductContext,
    alertLevels,
  });
}

// Modelo que nega o conflito com schema perfeitamente valido - e o que o
// auditor faz. `extra` acrescenta chaves a resposta do modelo.
function modeloQueNega(extra = {}, chamadas = [], safety = "normal") {
  return {
    messages: {
      create: async (request) => {
        chamadas.push(request);
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                answer: "Pode consumir sem preocupacao, nao tem nada disso.",
                category: "allergy",
                safety,
                usedProductContext: true,
                ...extra,
              }),
            },
          ],
        };
      },
    },
  };
}

// Pergunta como titular autenticado. Alergias e nivel vem dos carregadores
// injetados - no app, os dois leem o PostgreSQL.
function perguntar(produto, perfil, niveis, cliente, logger = { warn: () => {} }) {
  return answerAssistantChat(
    { user: { id: "titular-de-teste" } },
    { message: "Posso consumir esse produto?", conversation: [], product: produto, guestAllergies: [] },
    cliente,
    { loadUserAllergies: async () => perfil, loadUserAlertLevels: async () => niveis, logger },
  );
}

// Saida do `buildAllergyVerdict` da v0.8.0 (commit f2e1ae5, antes desta versao)
// para cada produto e perfil abaixo, gravada literalmente. E o gabarito do
// "byte a byte": com nivel padrao, o veredito de hoje tem de ser este texto.
const GABARITO_V080 = [
  ["declarado", ["peanut"],
    "{\"status\":\"conflict\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"Este produto tem Amendoim, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.\",\"minimumSafety\":\"caution\"}"],
  ["declarado", ["peanut","milk"],
    "{\"status\":\"conflict\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"Este produto tem Amendoim, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.\",\"minimumSafety\":\"caution\"}"],
  ["declarado", ["milk","gluten","peanut"],
    "{\"status\":\"conflict\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"Este produto tem Amendoim, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.\",\"minimumSafety\":\"caution\"}"],
  ["declarado", [],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_profile_allergies\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["traco", ["peanut"],
    "{\"status\":\"traces\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"profileSource\":\"request\",\"alert\":\"Este produto pode conter traços de Amendoim. O rótulo não garante ausência.\",\"minimumSafety\":null}"],
  ["traco", ["peanut","milk"],
    "{\"status\":\"traces\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"profileSource\":\"request\",\"alert\":\"Este produto pode conter traços de Amendoim. O rótulo não garante ausência.\",\"minimumSafety\":null}"],
  ["traco", ["milk","gluten","peanut"],
    "{\"status\":\"traces\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"profileSource\":\"request\",\"alert\":\"Este produto pode conter traços de Amendoim. O rótulo não garante ausência.\",\"minimumSafety\":null}"],
  ["traco", [],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_profile_allergies\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["misto", ["peanut"],
    "{\"status\":\"traces\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"profileSource\":\"request\",\"alert\":\"Este produto pode conter traços de Amendoim. O rótulo não garante ausência.\",\"minimumSafety\":null}"],
  ["misto", ["peanut","milk"],
    "{\"status\":\"conflict\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[{\"id\":\"milk\",\"label\":\"Leite/lactose\"}],\"traces\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"profileSource\":\"request\",\"alert\":\"Este produto tem Leite/lactose, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.\",\"minimumSafety\":\"caution\"}"],
  ["misto", ["milk","gluten","peanut"],
    "{\"status\":\"conflict\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[{\"id\":\"milk\",\"label\":\"Leite/lactose\"},{\"id\":\"gluten\",\"label\":\"Gluten\"}],\"traces\":[{\"id\":\"peanut\",\"label\":\"Amendoim\"}],\"profileSource\":\"request\",\"alert\":\"Este produto tem Leite/lactose e Gluten, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.\",\"minimumSafety\":\"caution\"}"],
  ["misto", [],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_profile_allergies\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["limpo", ["peanut"],
    "{\"status\":\"clear\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["limpo", ["peanut","milk"],
    "{\"status\":\"clear\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["limpo", ["milk","gluten","peanut"],
    "{\"status\":\"clear\",\"reason\":null,\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["limpo", [],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_profile_allergies\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["semProduto", ["peanut"],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_product\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["semProduto", ["peanut","milk"],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_product\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["semProduto", ["milk","gluten","peanut"],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_product\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
  ["semProduto", [],
    "{\"status\":\"not_evaluated\",\"reason\":\"no_product\",\"source\":\"deterministic_engine\",\"conflicts\":[],\"traces\":[],\"profileSource\":\"request\",\"alert\":\"\",\"minimumSafety\":null}"],
];

const PRODUTOS_DO_GABARITO = {
  declarado: PRODUTO_DECLARADO,
  traco: PRODUTO_TRACO,
  misto: PRODUTO_MISTO,
  limpo: { name: "Agua", ingredients_text: "agua mineral" },
  semProduto: null,
};

// ---------------------------------------------------------------------------
// S1 a S4 - o que muda no veredito, caso a caso
// ---------------------------------------------------------------------------

test("S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0", () => {
  const v = veredito(PRODUTO_DECLARADO, ["peanut"], { peanut: "standard" });
  assert.equal(v.status, "conflict");
  assert.equal(v.minimumSafety, CONFLICT_MINIMUM_SAFETY);
  assert.deepEqual(v.conflicts, [{ id: "peanut", label: "Amendoim" }]);

  // Byte a byte: os 20 casos do gabarito, sem mapa de nivel e com o mapa
  // explicito em `standard`, saem com o mesmo texto da v0.8.0.
  assert.equal(GABARITO_V080.length, 20);
  for (const [produto, perfil, esperado] of GABARITO_V080) {
    const padrao = Object.fromEntries(perfil.map((id) => [id, "standard"]));
    const semMapa = JSON.stringify(veredito(PRODUTOS_DO_GABARITO[produto], perfil, undefined));
    const comMapa = JSON.stringify(veredito(PRODUTOS_DO_GABARITO[produto], perfil, padrao));
    assert.equal(semMapa, esperado, `${produto} ${perfil.join(",")}: sem mapa, o veredito mudou`);
    assert.equal(comMapa, esperado, `${produto} ${perfil.join(",")}: com nivel padrao, o veredito mudou`);
  }
});

test("S2 alerta maximo + conflito declarado: piso urgent", () => {
  const v = veredito(PRODUTO_DECLARADO, ["peanut"], { peanut: "strict" });
  assert.equal(v.status, "conflict");
  assert.equal(STRICT_CONFLICT_MINIMUM_SAFETY, "urgent");
  assert.equal(v.minimumSafety, "urgent");
  assert.deepEqual(v.conflicts, [{ id: "peanut", label: "Amendoim", origin: "declared", alertLevel: "strict" }]);
});

test("S3 alerta maximo + traco: conflito no veredito, piso caution", () => {
  const v = veredito(PRODUTO_TRACO, ["peanut"], { peanut: "strict" });
  assert.equal(v.status, "conflict", "traco de alergia em alerta maximo tem de virar conflito");
  assert.equal(v.minimumSafety, "caution", "o piso do traco e caution, nunca urgent");
  assert.deepEqual(v.conflicts, [{ id: "peanut", label: "Amendoim", origin: "traces", alertLevel: "strict" }]);
  assert.deepEqual(v.traces, []);
});

test("S4 nivel padrao + traco: nenhum conflito, igual a v0.8.0", () => {
  const v = veredito(PRODUTO_TRACO, ["peanut"], { peanut: "standard" });
  assert.equal(v.status, "traces");
  assert.deepEqual(v.conflicts, []);
  assert.equal(v.minimumSafety, null);
  const [, , esperado] = GABARITO_V080.find(([produto, perfil]) => produto === "traco" && perfil.join() === "peanut");
  assert.equal(JSON.stringify(v), esperado);
});

// ---------------------------------------------------------------------------
// S5 e S6 - o modelo nao derruba o piso nem toca no nivel
// ---------------------------------------------------------------------------

test("S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos", async () => {
  const casos = [
    // [nome, produto, nivel, safety que tem de chegar ao cliente]
    ["S1 padrao + declarado", PRODUTO_DECLARADO, "standard", "caution"],
    ["S2 maximo + declarado", PRODUTO_DECLARADO, "strict", "urgent"],
    ["S3 maximo + traco", PRODUTO_TRACO, "strict", "caution"],
    // Sem conflito nao ha piso: o "normal" do modelo fica, como na v0.8.0.
    ["S4 padrao + traco", PRODUTO_TRACO, "standard", "normal"],
  ];
  for (const [nome, produto, nivel, esperado] of casos) {
    const resposta = await perguntar(produto, ["peanut"], { peanut: nivel }, modeloQueNega());
    assert.equal(resposta.source, "anthropic", `${nome}: a resposta tem de ter passado pelo modelo`);
    assert.equal(resposta.safety, esperado, `${nome}: chegou ${resposta.safety}`);
    assert.equal(resposta.allergyVerdict.safetyFloorApplied, esperado !== "normal", `${nome}: piso aplicado?`);
  }

  // O modelo dizendo "caution" tambem nao segura o piso do alerta maximo.
  const cauteloso = await perguntar(PRODUTO_DECLARADO, ["peanut"], { peanut: "strict" }, modeloQueNega({}, [], "caution"));
  assert.equal(cauteloso.safety, "urgent");
});

test("S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta", async () => {
  const tentativas = [
    { alertLevel: "standard" },
    { alertLevels: { peanut: "standard" } },
    { severity: "standard" },
    { allergyVerdict: { minimumSafety: "normal", conflicts: [{ id: "peanut", alertLevel: "standard" }] } },
  ];
  for (const extra of tentativas) {
    await assert.rejects(
      perguntar(PRODUTO_DECLARADO, ["peanut"], { peanut: "strict" }, modeloQueNega(extra)),
      (erro) => erro.code === "AI_SCHEMA_INVALID",
      `a resposta com ${Object.keys(extra)[0]} deveria ser recusada`,
    );
  }

  // Segunda barreira: mesmo que um veredito do modelo chegasse ao ponto de
  // saida, ele e descartado e o do motor - com o nivel do perfil - entra.
  const doMotor = veredito(PRODUTO_DECLARADO, ["peanut"], { peanut: "strict" });
  const final = applyAllergyAuthority(
    { safety: "normal", allergyVerdict: { minimumSafety: "normal", conflicts: [{ id: "peanut", alertLevel: "standard" }] } },
    doMotor,
  );
  assert.equal(final.safety, "urgent");
  assert.equal(final.allergyVerdict.conflicts[0].alertLevel, "strict");
});

// ---------------------------------------------------------------------------
// S7 - o veredito distingue os casos para quem consome
// ---------------------------------------------------------------------------

test("S7 o veredito distingue declarado de traco, e alerta maximo de padrao", () => {
  // Leite e trigo declarados, amendoim em traco.
  const v = veredito(PRODUTO_MISTO, ["milk", "gluten", "peanut"], {
    milk: "strict",
    gluten: "standard",
    peanut: "strict",
  });
  assert.equal(v.status, "conflict");
  assert.equal(v.minimumSafety, "urgent");
  assert.deepEqual(v.conflicts, [
    { id: "milk", label: "Leite/lactose", origin: "declared", alertLevel: "strict" },
    { id: "gluten", label: "Gluten" },
    { id: "peanut", label: "Amendoim", origin: "traces", alertLevel: "strict" },
  ]);
  assert.deepEqual(v.conflicts.map(conflictOrigin), [VERDICT_ORIGIN.declared, VERDICT_ORIGIN.declared, VERDICT_ORIGIN.traces]);
  assert.match(v.alert, /Este produto tem Leite\/lactose e Gluten, que está no seu perfil de alergias\./);
  assert.match(v.alert, /Pode conter traços de Amendoim\./);
  assert.match(v.alert, /Você pediu alerta máximo para Leite\/lactose e Amendoim\./);

  // O mesmo produto com amendoim padrao: o traco volta a ser so `traces`.
  const padrao = veredito(PRODUTO_MISTO, ["milk", "gluten", "peanut"], { milk: "strict" });
  assert.deepEqual(padrao.traces, [{ id: "peanut", label: "Amendoim" }]);
  assert.equal(padrao.conflicts.some((c) => c.id === "peanut"), false);
});

// ---------------------------------------------------------------------------
// S8 a S10 - o contrato da gravacao, na validacao
// ---------------------------------------------------------------------------

test("S8 nivel desconhecido e recusado pela validacao", () => {
  assert.deepEqual(ALERT_LEVEL_VALUES, ["standard", "strict"]);
  for (const nivel of ["grave", "severe", "STRICT", "", "urgent", null, 1]) {
    assert.throws(
      () => validateAllergiesUpdate({ allergies: ["milk"], alertLevels: { milk: nivel } }),
      (erro) => erro.name === "ZodError",
      `o nivel ${JSON.stringify(nivel)} passou`,
    );
  }
});

test("S9 nivel para alergia ausente do perfil e recusado pela validacao", () => {
  assert.throws(
    () => validateAllergiesUpdate({ allergies: ["milk"], alertLevels: { peanut: "strict" } }),
    (erro) => erro.issues.some((i) => i.message === "Nível de alerta para alergia que não está no perfil."),
  );
  // Chave que nem e alergia do catalogo, inclusive as que mexeriam no prototipo.
  for (const chave of ["naoexiste", "__proto__", "constructor"]) {
    const corpo = JSON.parse(`{"allergies":["milk"],"alertLevels":{"${chave}":"strict"}}`);
    assert.throws(() => validateAllergiesUpdate(corpo), (erro) => erro.name === "ZodError", `a chave ${chave} passou`);
  }
});

test("S10 corpo sem nivel continua valido e significa padrao", () => {
  const semNivel = validateAllergiesUpdate({ allergies: ["milk", "peanut"] });
  assert.deepEqual(semNivel, { allergies: ["milk", "peanut"], alertLevels: {} });
  const publico = toPublicUser({ id: "u", name: "n", email: "e" }, semNivel.allergies, semNivel.alertLevels);
  assert.deepEqual(publico.alertLevels, { milk: "standard", peanut: "standard" });

  const comNivel = validateAllergiesUpdate({ allergies: ["milk", "peanut"], alertLevels: { peanut: "strict" } });
  assert.deepEqual(comNivel.alertLevels, { peanut: "strict" });
  // `user_id`/`userId` no corpo nunca passam da validacao.
  assert.equal("userId" in validateAllergiesUpdate({ allergies: [], userId: "outro" }), false);
});

// ---------------------------------------------------------------------------
// S17 e S18 - nivel fora do log e fora do payload do modelo
// ---------------------------------------------------------------------------

test("S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo", async () => {
  async function registrar(nivel) {
    resetMinimizationAttempts();
    const linhas = [];
    await perguntar(PRODUTO_MISTO, ["milk", "peanut"], { milk: nivel, peanut: nivel }, modeloQueNega(), {
      warn: (linha) => linhas.push(linha),
    });
    resetMinimizationAttempts();
    return linhas;
  }

  const padrao = await registrar("standard");
  const maximo = await registrar("strict");
  assert.equal(padrao.length, 1, "a tentativa de minimizacao tem de ser registrada");
  assert.deepEqual(maximo, padrao, "o registro mudou com o nivel: o log conta qual alergia e alerta maximo");
  for (const proibido of ["strict", "standard", "alertLevel", "alert_level", "urgent", "enforcedSafety", "traces"]) {
    assert.equal(maximo[0].includes(proibido), false, `o log carrega "${proibido}"`);
  }
  assert.deepEqual(JSON.parse(maximo[0]).conflicts, ["milk"], "so o conflito declarado entra no registro");
});

test("S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot", async () => {
  async function payload(nivel) {
    const chamadas = [];
    await perguntar(PRODUTO_MISTO, ["milk", "peanut"], { milk: nivel, peanut: nivel }, modeloQueNega({}, chamadas));
    return chamadas[0];
  }
  const padrao = await payload("standard");
  const maximo = await payload("strict");
  assert.equal(JSON.stringify(maximo), JSON.stringify(padrao), "o que vai ao modelo mudou com o nivel de alerta");

  const texto = JSON.stringify(maximo);
  for (const proibido of ["strict", "alertLevel", "alert_level", "alertaMaximo", "minimumSafety", "allergyVerdict"]) {
    assert.equal(texto.includes(proibido), false, `o payload carrega "${proibido}"`);
  }

  // O snapshot que vai ao modelo tem exatamente as chaves da v0.8.0.
  const conteudo = JSON.parse(maximo.messages.at(-1).content[0].text);
  assert.deepEqual(Object.keys(conteudo.context.allergySnapshot).sort(), [
    "allRisks",
    "detectedConflicts",
    "hasDeclaredConflict",
    "hasProductContext",
    "hasTraceConflict",
    "possibleTraces",
    "profileAllergies",
    "profileRisks",
  ]);
});

// ---------------------------------------------------------------------------
// A tela: o que a interface faz com a distincao, e o que ela NAO diz
// ---------------------------------------------------------------------------

async function carregarEsbuild() {
  try {
    const esbuild = await import("esbuild");
    await import("react");
    await import("react-dom/server");
    return esbuild;
  } catch {
    return null;
  }
}
const esbuild = await carregarEsbuild();
const semEsbuild = esbuild ? false : "NAO EXECUTADO - esbuild/react ausentes: instale as dependencias do package raiz";

// Renderiza os componentes REAIS, compilados na hora - como no T7.
async function renderizar(nomeDoExport, props) {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { AllergyVerdict } from "./src/components/assistant/AllergyVerdict.jsx";
        import { AlertLevelPicker } from "./src/components/allergies/AlertLevelPicker.jsx";
        import { HomePage } from "./src/pages/Home/HomePage.jsx";
        const componentes = { AllergyVerdict, AlertLevelPicker, HomePage };
        export function render(nome, props) {
          return renderToStaticMarkup(React.createElement(componentes[nome], props));
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
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-nivel-"));
  const arquivo = path.join(dir, "render.mjs");
  try {
    writeFileSync(arquivo, bundle.outputFiles[0].text, "utf8");
    const modulo = await import(pathToFileURL(arquivo).href);
    return modulo.render(nomeDoExport, props);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const textoVisivel = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");

test("S7 a tela diz coisas diferentes para alerta maximo e para traco", { skip: semEsbuild }, async () => {
  const declarado = textoVisivel(
    await renderizar("AllergyVerdict", { verdict: veredito(PRODUTO_DECLARADO, ["peanut"], { peanut: "strict" }) }),
  );
  assert.match(declarado, /Alerta máximo: conflito com o seu perfil/);
  assert.match(declarado, /Amendoim · alerta máximo/);

  const traco = textoVisivel(
    await renderizar("AllergyVerdict", { verdict: veredito(PRODUTO_TRACO, ["peanut"], { peanut: "strict" }) }),
  );
  assert.match(traco, /Conflito com o seu perfil/);
  assert.doesNotMatch(traco, /Alerta máximo: conflito/, "traco nao recebe o titulo do piso urgent");
  assert.match(traco, /Pode conter Amendoim · alerta máximo/);

  const padrao = textoVisivel(
    await renderizar("AllergyVerdict", { verdict: veredito(PRODUTO_DECLARADO, ["peanut"], { peanut: "standard" }) }),
  );
  assert.doesNotMatch(padrao, /alerta máximo/i, "nivel padrao nao fala de alerta maximo");
});

test("o convite para revisar o nivel e dispensavel e nao bloqueia a tela", { skip: semEsbuild }, async () => {
  const base = { selectedAllergies: ["milk"], productAnalysis: null, onNavigate: () => {}, onSearchAndOpen: () => {} };
  const comConvite = await renderizar("HomePage", { ...base, alertInvite: { visible: true, onReview: () => {}, onDismiss: () => {} } });
  assert.match(comConvite, /class="alert-invite"/);
  assert.match(textoVisivel(comConvite), /Revisar minhas alergias/);
  assert.match(textoVisivel(comConvite), /Agora não/);
  // Nao e modal: o resto da tela continua la, com os mesmos botoes.
  assert.match(textoVisivel(comConvite), /Escanear um produto/);
  assert.doesNotMatch(comConvite, /role="dialog"|aria-modal/);

  const semConvite = await renderizar("HomePage", { ...base, alertInvite: { visible: false } });
  assert.doesNotMatch(semConvite, /alert-invite/);
});

// 5.1 do prompt: o app nao diagnostica, nao aconselha e nao afirma condicao
// clinica. Confere o texto que a pessoa LE nas pecas novas desta versao.
const VOCABULARIO_PROIBIDO = /grav[ei]|anafil|diagn|cl[ií]nic|procure|atendimento|adrenalina|evite|emerg[eê]ncia|m[eé]dic|severa?\b/i;

test("o texto novo descreve o que o app faz, sem diagnostico nem orientacao medica", { skip: semEsbuild }, async () => {
  const textos = [
    veredito(PRODUTO_DECLARADO, ["peanut"], { peanut: "strict" }).alert,
    veredito(PRODUTO_TRACO, ["peanut"], { peanut: "strict" }).alert,
    veredito(PRODUTO_MISTO, ["milk", "peanut"], { milk: "strict", peanut: "strict" }).alert,
    textoVisivel(
      await renderizar("AlertLevelPicker", {
        selectedAllergies: ["milk", "peanut"],
        alertLevels: { peanut: "strict" },
        onSetAlertLevel: () => {},
      }),
    ),
    textoVisivel(
      await renderizar("HomePage", {
        selectedAllergies: ["milk"],
        productAnalysis: null,
        onNavigate: () => {},
        onSearchAndOpen: () => {},
        alertInvite: { visible: true, onReview: () => {}, onDismiss: () => {} },
      }),
    ).match(/Novidade.*Agora não/)?.[0],
  ];
  for (const texto of textos) {
    assert.ok(texto, "texto vazio na conferencia de vocabulario");
    assert.doesNotMatch(texto, VOCABULARIO_PROIBIDO, `vocabulario proibido em: ${texto}`);
  }
});
