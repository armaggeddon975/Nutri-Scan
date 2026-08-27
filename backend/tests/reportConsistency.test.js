import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { env } from "../src/config/env.js";

// T9 / achado M1 da auditoria externa da v0.6.7.
//
// O E2E_REPORT da v0.6.7 era o relatorio da v0.6.6 com o titulo trocado: ele
// declarava 79 testes (o total da versao anterior) e a data 2026-08-15,
// enquanto o CHANGELOG da propria versao dizia 2026-08-16. O teste de versao
// que ja existia nao pegou isso porque so olhava o cabecalho.
//
// POR QUE DATA E VERSAO, E NAO A CONTAGEM DE TESTES:
// afirmar aqui "o E2E_REPORT declara N testes" exigiria que este teste
// conhecesse o total da suite da qual ele mesmo faz parte. Cada teste novo
// mudaria o numero, e o documento so poderia ficar verde depois de uma segunda
// execucao - um alvo movel que erra sozinho e ensina a ignorar a falha. Data e
// versao sao estaveis, e pegam exatamente o defeito que aconteceu: relatorio
// herdado da versao anterior. A contagem real continua sendo obrigacao do
// relatorio, verificada por execucao e registrada no proprio documento.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

async function readText(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

function extractDeclaredDate(text, file) {
  const match = /^Data:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(text);
  assert.ok(match, `${file} nao declara uma linha "Data: AAAA-MM-DD"`);
  return match[1];
}

async function changelogDateForCurrentVersion() {
  const changelog = await readText("CHANGELOG.md");
  const pattern = new RegExp(
    `^## NutriScan v${env.version.replace(/\./g, "\\.")} - (\\d{4}-\\d{2}-\\d{2})\\s*$`,
    "m",
  );
  const match = pattern.exec(changelog);
  assert.ok(match, `CHANGELOG.md nao tem entrada datada para v${env.version}`);
  return match[1];
}

test("T9 E2E_REPORT e da versao atual e nao herda a data da versao anterior", async () => {
  const relatorio = await readText("E2E_REPORT.md");
  const [primeiraLinha] = relatorio.split(/\r?\n/);

  assert.ok(
    primeiraLinha.includes(`v${env.version}`),
    `E2E_REPORT.md anuncia "${primeiraLinha.trim()}" em vez de v${env.version}`,
  );

  const dataDoRelatorio = extractDeclaredDate(relatorio, "E2E_REPORT.md");
  const dataDoChangelog = await changelogDateForCurrentVersion();

  assert.equal(
    dataDoRelatorio,
    dataDoChangelog,
    `E2E_REPORT.md diz ${dataDoRelatorio} e o CHANGELOG da v${env.version} diz ${dataDoChangelog}: ` +
      "o relatorio parece ser o da versao anterior com o titulo trocado",
  );
});

test("T9b AUDIT_REPORT segue a mesma regra de data e versao", async () => {
  const relatorio = await readText("AUDIT_REPORT.md");
  const dataDoRelatorio = extractDeclaredDate(relatorio, "AUDIT_REPORT.md");
  const dataDoChangelog = await changelogDateForCurrentVersion();

  assert.equal(dataDoRelatorio, dataDoChangelog, "AUDIT_REPORT.md com data de outra versao");
});

// O AUDIT_REPORT mantem o registro das auditorias anteriores depois deste
// marcador. La, citar versao antiga e o comportamento correto.
const SECAO_HISTORICA = "## Historico de auditorias anteriores";

test("T9c os relatorios nao declaram versao antiga no corpo do texto", async () => {
  // A v0.6.7 tambem carregava o numero de testes da versao anterior. Nao da
  // para travar a contagem aqui, mas da para travar a mencao a outra versao
  // dentro do bloco de resultado da versao corrente.
  for (const file of ["E2E_REPORT.md", "AUDIT_REPORT.md"]) {
    const completo = await readText(file);
    const corte = completo.indexOf(SECAO_HISTORICA);
    const texto = corte === -1 ? completo : completo.slice(0, corte);
    const versoes = new Set(
      [...texto.matchAll(/"version":\s*"([^"]+)"/g)].map((match) => match[1]),
    );
    for (const versao of versoes) {
      assert.equal(versao, env.version, `${file} tem bloco de resultado com versao ${versao}`);
    }
  }
});
