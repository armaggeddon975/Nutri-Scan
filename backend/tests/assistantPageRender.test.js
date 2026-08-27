import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";

// T7 - a tela do Assistente precisa mostrar o veredito deterministico mesmo
// quando o texto do modelo afirma o contrario.
//
// O teste renderiza o componente REAL (src/pages/Assistant/AssistantPage.jsx),
// nao uma copia: o JSX e compilado e empacotado com esbuild na hora. Assim,
// remover o alerta da interface quebra este teste. React, react-dom e
// lucide-react entram no pacote, entao o arquivo gerado nao resolve nada em
// tempo de execucao.

const rootDir = path.resolve(import.meta.dirname, "..", "..");

// Ferramentas do frontend vivem no package raiz. Se alguem instalou apenas o
// backend, isso e ambiente ausente e precisa aparecer como tal.
async function loadBuildTools() {
  try {
    const esbuild = await import("esbuild");
    await import("react");
    await import("react-dom/server");
    return esbuild;
  } catch {
    return null;
  }
}

const esbuild = await loadBuildTools();
const skipReason = esbuild
  ? false
  : "NAO EXECUTADO - esbuild/react ausentes: instale as dependencias do package raiz";

async function renderAssistantPage(props) {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { AssistantPage } from "./src/pages/Assistant/AssistantPage.jsx";
        export function render(props) {
          return renderToStaticMarkup(React.createElement(AssistantPage, props));
        }
      `,
      resolveDir: rootDir,
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    // Mesmo runtime de JSX que o Vite usa: os componentes nao importam React.
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    // react-dom/server.node usa require("util") em tempo de execucao. Como o
    // pacote gerado e ESM, `require` precisa existir la dentro.
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    logLevel: "silent",
  });

  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-render-"));
  const file = path.join(dir, "assistant-page.mjs");
  try {
    writeFileSync(file, bundle.outputFiles[0].text, "utf8");
    const module = await import(pathToFileURL(file).href);
    return module.render(props);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TEXTO_MENTIROSO =
  "Este produto NAO contem leite e e totalmente seguro para voce. Pode consumir sem preocupacao.";

const VEREDITO_COM_CONFLITO = buildAllergyVerdict({
  profileRisks: [{ id: "milk", label: "Leite/lactose", severity: "contains" }],
  profileAllergies: ["milk"],
  hasProductContext: true,
});

function baseProps(messages) {
  return {
    chatLogRef: { current: null },
    assistantConnection: { type: "success", message: "Nutri IA respondeu." },
    assistantMessages: messages,
    assistantLoading: false,
    assistantQuestion: "",
    hasLastQuestion: false,
    onQuestionChange: () => {},
    onSubmitAssistant: () => {},
    onRetryAssistant: () => {},
  };
}

test(
  "T7 a tela do Assistente mostra o alerta deterministico mesmo com texto que nega o conflito",
  { skip: skipReason },
  async () => {
    const html = await renderAssistantPage(
      baseProps([
        { role: "user", text: "Posso consumir esse produto?" },
        {
          role: "assistant",
          text: TEXTO_MENTIROSO,
          source: "anthropic",
          verdict: VEREDITO_COM_CONFLITO,
        },
      ]),
    );

    assert.ok(html.includes("allergy-verdict danger"), "o bloco de conflito precisa ser renderizado");
    assert.ok(html.includes("Conflito com o seu perfil"));
    assert.ok(html.includes("Leite/lactose"));
    assert.ok(html.includes(VEREDITO_COM_CONFLITO.alert));
    // O texto do modelo continua visivel, como explicacao.
    assert.ok(html.includes("totalmente seguro"));
    // E aparece DEPOIS do alerta, nunca antes.
    assert.ok(html.indexOf("allergy-verdict") < html.indexOf("totalmente seguro"));
  },
);

test(
  "T7b sem veredito de conflito a tela nao inventa alerta",
  { skip: skipReason },
  async () => {
    const semConflito = buildAllergyVerdict({
      profileRisks: [],
      profileAllergies: ["milk"],
      hasProductContext: true,
    });

    const html = await renderAssistantPage(
      baseProps([
        { role: "assistant", text: "Produto sem leite.", source: "anthropic", verdict: semConflito },
      ]),
    );

    assert.equal(html.includes("allergy-verdict danger"), false);
    assert.ok(html.includes("Sem conflito com o seu perfil"));
  },
);

test(
  "T7c mensagem sem veredito (nao avaliado) nao renderiza bloco algum",
  { skip: skipReason },
  async () => {
    const html = await renderAssistantPage(
      baseProps([{ role: "assistant", text: "Oi! Como posso ajudar?", source: "anthropic" }]),
    );

    assert.equal(html.includes("allergy-verdict"), false);
    assert.ok(html.includes("Como posso ajudar"));
  },
);

test("T7d a interface nao deriva conflito do texto do modelo", () => {
  // Guarda de codigo-fonte: o componente so pode ler `verdict.status`.
  // Se alguem tentar inferir alergia do texto, isto quebra.
  const componente = readSource("src/components/assistant/AllergyVerdict.jsx");
  assert.equal(/message\.text|answer|includes\(/.test(componente), false);
  assert.ok(componente.includes("verdict?.status") || componente.includes("verdict.status"));

  const pagina = readSource("src/pages/Assistant/AssistantPage.jsx");
  assert.ok(pagina.includes("verdict={message.verdict}"));
});

function readSource(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}
