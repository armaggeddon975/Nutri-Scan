import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// P2t - o gate de release nao pode ignorar vulnerabilidade moderate.
//
// Na v0.6.9 o backend acumulou tres avisos moderate em `qs`, puxado por
// `express` e `body-parser` (GHSA-x5fp-wj9c-mxmx, bypass de array-limit, e
// GHSA-4mjr-xmp4-gh2g, DoS via isBuffer controlado por atacante). As duas linhas
// de audit do gate usavam `--audit-level=high`, entao ele reportou [OK] com as
// tres vulnerabilidades presentes.
//
// O defeito nao foi a vulnerabilidade: foi o gate declarar aprovacao sem olhar.
// Este teste existe para que subir o limiar de volta seja uma alteracao
// visivel, que quebra a suite, e nao um ajuste silencioso.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

// Do mais permissivo para o mais estrito. `low` e `info` aceitam MAIS avisos
// que moderate, entao servem. `high` e `critical` deixariam moderate passar.
//
// A regex casa apenas o argumento entre aspas duplas, que e o que chega ao npm.
// O comentario do gate cita `--audit-level=high` entre crases para explicar o
// defeito historico, e nao deve ser confundido com configuracao ativa.
const NIVEIS_ACEITOS = new Set(["moderate", "low", "info"]);

async function lerGate() {
  return readFile(path.join(rootDir, "scripts/verify-release.js"), "utf8");
}

test("P2t as duas linhas de audit do gate existem", async () => {
  const gate = await lerGate();
  const niveis = [...gate.matchAll(/"--audit-level=([a-z]+)"/g)].map((m) => m[1]);

  assert.equal(
    niveis.length,
    2,
    `esperado 2 comandos de audit no gate, encontrado ${niveis.length}: ${niveis.join(", ")}`,
  );
});

test("P2t nenhum audit do gate roda com limiar high ou critical", async () => {
  const gate = await lerGate();
  const niveis = [...gate.matchAll(/"--audit-level=([a-z]+)"/g)].map((m) => m[1]);

  for (const nivel of niveis) {
    assert.ok(
      NIVEIS_ACEITOS.has(nivel),
      `gate roda audit com --audit-level=${nivel}: vulnerabilidade moderate passaria despercebida`,
    );
  }
});

// A ausencia de `high` no arquivo nao basta: alguem poderia remover a flag por
// inteiro, e o padrao do npm audit e `low`, que serviria - mas tambem poderia
// remover a etapa de audit toda. Este teste trava a presenca das duas etapas.
test("P2t o gate executa audit no frontend e no backend", async () => {
  const gate = await lerGate();

  assert.match(gate, /\["frontend audit",/, "etapa de audit do frontend sumiu do gate");
  assert.match(gate, /\["backend audit",/, "etapa de audit do backend sumiu do gate");
  assert.match(
    gate,
    /"--prefix",\s*"backend",\s*"audit"/,
    "a etapa de audit do backend precisa rodar com --prefix backend",
  );
});
