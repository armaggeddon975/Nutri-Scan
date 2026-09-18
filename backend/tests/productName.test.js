import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// P1t - o produto se chama NutriScan.
//
// Em 04/09/2026 o produto foi renomeado para "NutriVa" (commit f740658) e em
// 18/09/2026 a decisao foi revertida. Nenhuma das duas trocas teve versao
// propria, entao residuo do nome antigo passou despercebido: o ZIP auditado da
// v0.6.9 saiu com `nutriva` em `package.json`, nos dois lockfiles e na interface.
//
// Este teste existe para que a terceira troca, se houver, nao dependa de alguem
// lembrar de olhar. Ele falha se o nome antigo voltar a qualquer lugar que o
// usuario, o auditor ou o gerenciador de pacotes leiam.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

const NOME_ANTIGO = /NutriVa|nutriva|NUTRIVA/;

// Diretorios que nao fazem parte do produto entregue.
const DIRS_IGNORADOS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  "releases",
  ".vite",
  // Configuracao local de ferramenta. Nao vai no ZIP, nao chega ao auditor e
  // pode ser reescrita pela propria ferramenta a qualquer momento: falha aqui
  // seria ruido sem relacao com o produto.
  ".claude",
]);

// Arquivos binarios ou grandes demais para inspecao de texto.
const EXTENSOES_BINARIAS = new Set([".png", ".jpg", ".jpeg", ".webp", ".ico", ".zip", ".pdf"]);

// EXCECOES, e o motivo de cada uma.
//
// A regra que este teste impoe e a do auditor: o nome antigo nao pode existir em
// **codigo, manifesto, lockfile ou interface**. Documentos que existem para
// registrar o que aconteceu entre versoes sao outra coisa - um relatorio que
// nao pode nomear o residuo que removeu e um relatorio pior.
//
// CHANGELOG.md, AUDIT_REPORT.md e E2E_REPORT.md
//               os tres registram historico por natureza. O CHANGELOG nomeia o
//               produto como ele se chamava em cada data; os dois relatorios
//               descrevem o achado e citam literalmente o que foi encontrado na
//               arvore. Reescrever isso seria apagar historico, que e
//               exatamente o defeito M1 da v0.6.7.
//
// productName.test.js
//               este arquivo contem o proprio termo procurado.
//
// O que NAO e isento, de proposito: README.md e tudo em `docs/`. Eles descrevem
// o produto como ele e hoje, e nao como ele foi - residuo ali seria erro.
const ARQUIVO_ISENTO = new Set([
  "CHANGELOG.md",
  "AUDIT_REPORT.md",
  "E2E_REPORT.md",
  "productName.test.js",
]);

async function listarArquivos(dir, encontrados = []) {
  const entradas = await readdir(dir, { withFileTypes: true });
  for (const entrada of entradas) {
    if (entrada.isDirectory()) {
      if (DIRS_IGNORADOS.has(entrada.name)) continue;
      await listarArquivos(path.join(dir, entrada.name), encontrados);
      continue;
    }
    if (!entrada.isFile()) continue;
    if (EXTENSOES_BINARIAS.has(path.extname(entrada.name).toLowerCase())) continue;
    encontrados.push(path.join(dir, entrada.name));
  }
  return encontrados;
}

test("P1t o nome antigo do produto nao existe em codigo, manifesto, lockfile ou interface", async () => {
  const arquivos = await listarArquivos(rootDir);
  const achados = [];

  for (const arquivo of arquivos) {
    const nome = path.basename(arquivo);
    if (ARQUIVO_ISENTO.has(nome)) continue;

    const conteudo = await readFile(arquivo, "utf8").catch(() => null);
    if (conteudo === null) continue;

    const texto = conteudo;
    if (!NOME_ANTIGO.test(texto)) continue;

    const relativo = path.relative(rootDir, arquivo).replaceAll("\\", "/");
    for (const [indice, linha] of texto.split(/\r?\n/).entries()) {
      if (NOME_ANTIGO.test(linha)) {
        achados.push(`${relativo}:${indice + 1}  ${linha.trim().slice(0, 80)}`);
      }
    }
  }

  assert.deepEqual(
    achados,
    [],
    `nome antigo do produto encontrado em ${achados.length} linha(s):\n${achados.join("\n")}`,
  );
});

// A ausencia do nome antigo nao prova que o nome certo esta la. Um
// `package.json` sem campo `name` passaria no teste acima.
test("P1t os manifestos declaram o nome NutriScan", async () => {
  const raiz = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  const backend = JSON.parse(await readFile(path.join(rootDir, "backend/package.json"), "utf8"));

  assert.equal(raiz.name, "nutriscan");
  assert.equal(backend.name, "nutriscan-backend");

  for (const lockfile of ["package-lock.json", "backend/package-lock.json"]) {
    const lock = JSON.parse(await readFile(path.join(rootDir, lockfile), "utf8"));
    const esperado = lockfile.startsWith("backend") ? "nutriscan-backend" : "nutriscan";
    assert.equal(lock.name, esperado, `${lockfile} declara nome errado`);
    assert.equal(lock.packages?.[""]?.name, esperado, `${lockfile} packages[""] com nome errado`);
  }
});
