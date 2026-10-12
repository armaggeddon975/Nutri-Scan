import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO } from "../src/config/env.js";
import { VARIAVEIS_LIDAS_PELO_BACKEND } from "./helpers/producao.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

// v0.7.6 - Entrega C. O checklist de publicacao so serve se continuar certo.
// Um documento que lista variaveis a mao envelhece no dia em que alguem
// acrescenta uma no codigo; estes testes amarram o documento ao codigo.

const lerDoc = (relativo) => readFile(path.join(rootDir, relativo), "utf8");

test("DEPLOY.md lista toda variavel que o backend le, e a da plataforma", async () => {
  const doc = await lerDoc("docs/DEPLOY.md");
  for (const nome of [...VARIAVEIS_LIDAS_PELO_BACKEND, "NODE_VERSION"]) {
    assert.match(doc, new RegExp(`^${nome}\\s`, "m"), `${nome} falta na tabela de variaveis do DEPLOY.md`);
  }
});

test("DEPLOY.md marca como obrigatoria exatamente as obrigatorias do codigo", async () => {
  const doc = await lerDoc("docs/DEPLOY.md");
  const linhasSim = [...doc.matchAll(/^([A-Z_]+)\s+SIM\s/gm)].map((m) => m[1]).sort();
  assert.deepEqual(linhasSim, [...VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO].sort());
});

test("DEPLOY.md explica cada subgate e o diagnostico de cada falha", async () => {
  const doc = await lerDoc("docs/DEPLOY.md");
  const prova = doc.slice(doc.indexOf("### 7."), doc.indexOf("### 8."));
  const falha = doc.slice(doc.indexOf("### 8."), doc.indexOf("### 9."));
  for (const id of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"]) {
    assert.match(prova, new RegExp(`^${id}\\s`, "m"), `${id} sem explicacao do que prova`);
    assert.match(falha, new RegExp(`^${id}\\s`, "m"), `${id} sem causa provavel de falha`);
  }
});

test("DEPLOY.md traz o comando real, o aviso de somente leitura e o da IA", async () => {
  const doc = await lerDoc("docs/DEPLOY.md");
  assert.match(doc, /npm run verify:deploy https:\/\/<url-publicada>/);
  assert.match(doc, /\*\*Ele so le:\*\*/);
  assert.match(doc, /veredito de alergia NAO depende de IA/);
  assert.match(doc, /No BUILD, nunca no start/);
});

test("O1 a ausencia de SESSION_SECRET esta documentada no README e no DEPLOY.md", async () => {
  for (const arquivo of ["README.md", "docs/DEPLOY.md"]) {
    const doc = await lerDoc(arquivo);
    assert.match(doc, /SESSION_SECRET/, `${arquivo} nao fala de SESSION_SECRET`);
    assert.match(doc, /token opaco|token aleatorio/i, `${arquivo} nao diz por que a sessao dispensa segredo`);
  }
  const readme = await lerDoc("README.md");
  assert.match(readme, /docs\/DEPLOY\.md/, "o README nao aponta para o checklist de publicacao");
});

test("O1 SESSION_SECRET continua sem ser lida pelo codigo nem declarada no render.yaml", async () => {
  // A decisao e NAO ter o segredo. Se um dia ele aparecer, este teste obriga a
  // rever a documentacao junto.
  const render = await lerDoc("render.yaml");
  const env = await lerDoc("backend/src/config/env.js");
  assert.doesNotMatch(render, /key:\s*SESSION_SECRET/);
  assert.doesNotMatch(env, /process\.env\.SESSION_SECRET/);
});

test("nenhum documento de publicacao carrega valor com forma de credencial", async () => {
  for (const arquivo of ["docs/DEPLOY.md", "README.md", "render.yaml"]) {
    const doc = await lerDoc(arquivo);
    assert.doesNotMatch(doc, /sk-ant-[A-Za-z0-9_-]{16,}/, `${arquivo}: chave da Anthropic`);
    assert.doesNotMatch(doc, /npg_[A-Za-z0-9]{10,}/, `${arquivo}: senha do Neon`);
    assert.doesNotMatch(doc, /\.neon\.tech/i, `${arquivo}: host do Neon`);
  }
});
