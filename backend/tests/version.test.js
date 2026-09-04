import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { env } from "../src/config/env.js";

// Regressao da v0.6.2: `backend/README.md` continuou anunciando v0.6.0 e com
// exemplos de health desatualizados depois que o projeto ja estava em 0.6.1.
// Estes testes travam a versao em todos os lugares que a declaram.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

test("package.json, backend/package.json e health declaram a mesma versao", async () => {
  const root = await readJson("package.json");
  const backend = await readJson("backend/package.json");

  assert.equal(root.version, env.version, "package.json diverge de APP_VERSION");
  assert.equal(backend.version, env.version, "backend/package.json diverge de APP_VERSION");
});

test("lockfiles acompanham a versao do pacote", async () => {
  for (const file of ["package-lock.json", "backend/package-lock.json"]) {
    const lock = await readJson(file);
    assert.equal(lock.version, env.version, `${file} raiz desatualizado`);
    assert.equal(lock.packages?.[""]?.version, env.version, `${file} packages[""] desatualizado`);
  }
});

test("cabecalho da documentacao anuncia a versao atual", async () => {
  const docs = [
    "README.md",
    "backend/README.md",
    "docs/API.md",
    "docs/ARCHITECTURE.md",
    "docs/AI_ASSISTANT.md",
    "AUDIT_REPORT.md",
    "E2E_REPORT.md",
  ];

  for (const doc of docs) {
    const [firstLine] = (await readText(doc)).split(/\r?\n/);
    assert.ok(
      firstLine.includes(`v${env.version}`),
      `${doc} anuncia "${firstLine.trim()}" em vez de v${env.version}`,
    );
  }
});

test("exemplos de health na documentacao usam a versao atual", async () => {
  const docs = ["README.md", "backend/README.md", "docs/API.md"];
  const pattern = /"version":\s*"([^"]+)"/g;

  for (const doc of docs) {
    const text = await readText(doc);
    for (const match of text.matchAll(pattern)) {
      assert.equal(match[1], env.version, `${doc} tem exemplo de health com versao ${match[1]}`);
    }
  }
});

test("CHANGELOG registra a versao atual", async () => {
  const changelog = await readText("CHANGELOG.md");
  assert.ok(
    changelog.includes(`## NutriVa v${env.version}`),
    `CHANGELOG.md nao tem secao para v${env.version}`,
  );
});
