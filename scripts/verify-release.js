import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { npmCommand, rootDir, statusLine } from "./common.js";

// SEMANTICA DESTE COMANDO
// verify:release = verificacao de codigo: doctor (normal), build, testes,
// audits e secret scan. Ele NAO prova PostgreSQL real, Claude real nem o fluxo
// E2E autenticado; para isso existe `npm run verify:e2e`.
const RELEASE_SCOPE = "build/test/audit/secret verification (nao equivale a E2E aprovado)";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "coverage", "logs", "caches", ".claude"]);
const EXCLUDED_FILES = new Set([".env", ".env.local"]);
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{16,}/,
  /ANTHROPIC_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{16,}/,
  /sk-(proj|svcacct|admin|live|test)-[A-Za-z0-9_-]{16,}/,
  /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{16,}/,
];

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDED_FILES.has(entry.name) || entry.name.endsWith(".zip")) continue;
    const fullPath = path.join(dir, entry.name);
    const relative = path.relative(rootDir, fullPath).replaceAll("\\", "/");
    if (relative === "backend/.env") continue;
    files.push(fullPath);
  }
  return files;
}

async function secretScan() {
  const files = await walk(rootDir);
  const hits = [];
  for (const file of files) {
    const statText = await readFile(file, "utf8").catch(() => "");
    if (!statText) continue;
    if (SECRET_PATTERNS.some((pattern) => pattern.test(statText))) {
      hits.push(path.relative(rootDir, file).replaceAll("\\", "/"));
    }
  }
  return hits;
}

async function runStep(label, command) {
  console.log(statusLine("RUN", label));
  const result = await command();
  if (result.code !== 0) {
    console.error(statusLine("FAIL", label));
    if (result.stderr) console.error(result.stderr.trim());
    process.exitCode = 1;
    return false;
  }
  console.log(statusLine("OK", label));
  return true;
}

async function main() {
  console.log(statusLine("INFO", "verify:release", RELEASE_SCOPE));

  const steps = [
    ["doctor", () => npmCommand(["run", "doctor"], { inherit: true })],
    ["frontend build", () => npmCommand(["run", "build"], { inherit: true })],
    ["backend tests", () => npmCommand(["--prefix", "backend", "test"], { inherit: true })],
    ["frontend audit", () => npmCommand(["audit", "--audit-level=high"], { inherit: true })],
    ["backend audit", () => npmCommand(["--prefix", "backend", "audit", "--audit-level=high"], { inherit: true })],
  ];

  for (const [label, command] of steps) {
    const ok = await runStep(label, command);
    if (!ok) return;
  }

  const hits = await secretScan();
  if (hits.length) {
    console.error(statusLine("FAIL", "secret scan", `${hits.length} suspicious file(s)`));
    for (const hit of hits) console.error(`- ${hit}`);
    process.exitCode = 1;
    return;
  }

  console.log(statusLine("OK", "secret scan", "0 real secrets"));
  console.log(statusLine("OK", "release verification", RELEASE_SCOPE));
  console.log(statusLine("INFO", "next gate", "npm run verify:e2e para provar PostgreSQL e fluxo real"));
}

main().catch((error) => {
  console.error(statusLine("FAIL", "release verification", error.message));
  process.exitCode = 1;
});
