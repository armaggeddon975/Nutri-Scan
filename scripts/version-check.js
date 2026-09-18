#!/usr/bin/env node
// P4 - compara a versao anunciada por um deploy com a versao deste repositorio.
//
// POR QUE ESTE SCRIPT EXISTE
//
// Os commits 9622ad8 e 168ae69 foram publicados em producao sob o numero 0.6.8.
// O `/api/health` passou a anunciar uma versao que nao correspondia ao codigo em
// execucao, e ninguem percebeu ate a auditoria seguinte. E a mesma classe do
// achado M1 da v0.6.7: documento divergindo do que existe.
//
// Este script torna a divergencia visivel em um comando. Ele NAO roda em CI de
// proposito: exigir rede em CI transforma indisponibilidade de terceiro em
// build vermelho, e o objetivo aqui e conferir um deploy, nao barrar um commit.
//
// USO
//   node scripts/version-check.js https://exemplo.onrender.com
//   npm run version:check -- https://exemplo.onrender.com
//
// Saida: exit 0 quando as versoes batem, exit 1 quando divergem ou quando nao
// foi possivel consultar. Nao consultar NAO e aprovacao.
//
// O codigo de saida e definido por `process.exitCode`, nunca por
// `process.exit()`: encerrar a forca enquanto o socket do fetch ainda fecha faz
// o libuv abortar no Windows, e o processo sai com codigo de crash em vez de 1.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const TIMEOUT_MS = 15000;

export function normalizarBase(entrada) {
  if (!entrada) return null;
  const texto = String(entrada).trim();
  if (!texto) return null;
  const comEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  try {
    const url = new URL(comEsquema);
    return url.origin;
  } catch {
    return null;
  }
}

export function compararVersoes(local, remota) {
  if (!remota) return { ok: false, motivo: "o deploy nao declarou versao em /api/health" };
  if (local !== remota) {
    return {
      ok: false,
      motivo: `repositorio declara ${local} e o deploy anuncia ${remota}`,
    };
  }
  return { ok: true, motivo: `ambos declaram ${local}` };
}

async function lerVersaoLocal() {
  const pacote = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
  return pacote.version;
}

async function lerVersaoRemota(base) {
  const controle = new AbortController();
  const timeout = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(`${base}/api/health`, {
      headers: { Accept: "application/json" },
      signal: controle.signal,
    });
    if (!resposta.ok) {
      throw new Error(`/api/health respondeu HTTP ${resposta.status}`);
    }
    const corpo = await resposta.json();
    return corpo?.version || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const base = normalizarBase(process.argv[2]);
  if (!base) {
    console.error("uso: node scripts/version-check.js <url-do-deploy>");
    console.error("exemplo: node scripts/version-check.js https://exemplo.onrender.com");
    process.exitCode = 1;
    return;
  }

  const local = await lerVersaoLocal();
  console.log(`[RUN] version:check - ${base}/api/health`);

  let remota;
  try {
    remota = await lerVersaoRemota(base);
  } catch (erro) {
    // Falha de consulta e NAO EXECUTADO, nunca aprovacao.
    console.error(`[FAIL] version:check - nao foi possivel consultar: ${erro.message}`);
    process.exitCode = 1;
    return;
  }

  const resultado = compararVersoes(local, remota);
  if (!resultado.ok) {
    console.error(`[FAIL] version:check - ${resultado.motivo}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[OK] version:check - ${resultado.motivo}`);
}

// So executa quando chamado direto. Importado por teste, apenas exporta.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((erro) => {
    console.error(`[FAIL] version:check - ${erro.message}`);
    process.exitCode = 1;
  });
}
