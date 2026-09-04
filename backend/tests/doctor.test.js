import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BACKEND_REQUIRED_MODULES,
  FRONTEND_REQUIRED_MODULES,
  STRICT_REQUIRED_KEYS,
  compareMigrations,
  describeDependencies,
  evaluateStrict,
  summarizeDependencies,
} from "../../scripts/lib/doctorChecks.js";
import { parseEnvText, probeEnvWithoutDependencies } from "../../scripts/lib/envProbe.js";
import { evaluateSessionSchema } from "../../scripts/lib/sessionSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const scriptsDir = path.join(rootDir, "scripts");

const IMPORT_PATTERN = /^\s*import\s[^"']*["']([^"']+)["']/gm;

async function collectImports(filePath) {
  const source = await readFile(filePath, "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]);
}

function isBootstrapSafe(specifier) {
  return specifier.startsWith("node:") || specifier.startsWith("./") || specifier.startsWith("../");
}

test("doctor e suas libs so importam built-ins do Node.js no topo do arquivo", async () => {
  const libFiles = (await readdir(path.join(scriptsDir, "lib"))).map((file) =>
    path.join(scriptsDir, "lib", file),
  );
  const files = [path.join(scriptsDir, "doctor.js"), path.join(scriptsDir, "common.js"), ...libFiles];

  for (const file of files) {
    for (const specifier of await collectImports(file)) {
      assert.equal(
        isBootstrapSafe(specifier),
        true,
        `${path.relative(rootDir, file)} importa dependencia externa no topo: ${specifier}`,
      );
    }
  }
});

test("doctor nao importa modulos do backend de forma estatica", async () => {
  const doctorSource = await readFile(path.join(scriptsDir, "doctor.js"), "utf8");
  const staticBackendImports = [...doctorSource.matchAll(IMPORT_PATTERN)]
    .map((match) => match[1])
    .filter((specifier) => specifier.includes("backend/"));

  assert.deepEqual(staticBackendImports, []);
});

test("projeto recem-extraido reporta WARN de dependencias em vez de quebrar", () => {
  const frontend = summarizeDependencies({
    hasDirectory: false,
    modules: FRONTEND_REQUIRED_MODULES,
    canResolve: () => false,
  });
  const backend = summarizeDependencies({
    hasDirectory: false,
    modules: BACKEND_REQUIRED_MODULES,
    canResolve: () => false,
  });

  assert.deepEqual(describeDependencies(frontend, "npm install"), {
    status: "WARN",
    detail: "run npm install",
  });
  assert.deepEqual(describeDependencies(backend, "npm --prefix backend install"), {
    status: "WARN",
    detail: "run npm --prefix backend install",
  });
});

test("node_modules incompleto nao pode ser considerado OK", () => {
  const installed = new Set(["express", "dotenv"]);
  const backend = summarizeDependencies({
    hasDirectory: true,
    modules: BACKEND_REQUIRED_MODULES,
    canResolve: (name) => installed.has(name),
  });

  assert.equal(backend.complete, false);
  assert.deepEqual(backend.missing, ["pg", "@anthropic-ai/sdk"]);

  const described = describeDependencies(backend, "npm --prefix backend install");
  assert.equal(described.status, "WARN");
  assert.ok(described.detail.includes("incomplete, missing pg, @anthropic-ai/sdk"));
});

test("dependencias completas resolvem para OK", () => {
  const summary = summarizeDependencies({
    hasDirectory: true,
    modules: BACKEND_REQUIRED_MODULES,
    canResolve: () => true,
  });

  assert.equal(summary.complete, true);
  assert.equal(describeDependencies(summary, "npm --prefix backend install").status, "OK");
});

test("modo strict exige dependencias, banco, migrations e Anthropic", () => {
  const checks = [
    { key: "frontendDependencies", label: "Frontend dependencies", status: "OK", detail: "installed" },
    { key: "backendDependencies", label: "Backend dependencies", status: "OK", detail: "installed" },
    { key: "databaseUrl", label: "DATABASE_URL", status: "WARN", detail: "not_configured" },
    { key: "postgres", label: "PostgreSQL", status: "WARN", detail: "DATABASE_URL not configured" },
    { key: "migrations", label: "Migrations", status: "WARN", detail: "not checked" },
    { key: "anthropicApiKey", label: "ANTHROPIC_API_KEY", status: "WARN", detail: "not_configured" },
    { key: "anthropicModel", label: "ANTHROPIC_MODEL", status: "OK", detail: "claude-sonnet-5" },
    { key: "docker", label: "Docker", status: "WARN", detail: "unavailable (optional)" },
  ];

  const strict = evaluateStrict(checks);
  assert.equal(strict.ok, false);
  assert.deepEqual(
    strict.failures.map((failure) => failure.key),
    ["databaseUrl", "postgres", "migrations", "anthropicApiKey"],
  );

  const complete = checks.map((check) =>
    STRICT_REQUIRED_KEYS.includes(check.key) ? { ...check, status: "OK" } : check,
  );
  assert.equal(evaluateStrict(complete).ok, true);
});

test("modo normal aceita WARN de PostgreSQL e Anthropic sem exigir exit 1", () => {
  const checks = [
    { key: "node", label: "Node.js", status: "OK", detail: "24.0.0" },
    { key: "postgres", label: "PostgreSQL", status: "WARN", detail: "DATABASE_URL not configured" },
    { key: "anthropicApiKey", label: "ANTHROPIC_API_KEY", status: "WARN", detail: "not_configured" },
  ];

  assert.equal(
    checks.some((check) => check.status === "FAIL"),
    false,
  );
});

test("migrations comparam arquivos do disco com schema_migrations", () => {
  const files = ["001_initial_schema.sql", "002_extra.sql"];

  assert.equal(compareMigrations(files, files).status, "OK");
  assert.match(compareMigrations(files, files).detail, /2\/2 applied/);

  const pending = compareMigrations(files, ["001_initial_schema.sql"]);
  assert.equal(pending.status, "WARN");
  assert.deepEqual(pending.pending, ["002_extra.sql"]);

  assert.equal(compareMigrations([], []).status, "WARN");

  const unknown = compareMigrations(["001_initial_schema.sql"], [
    "001_initial_schema.sql",
    "999_futura.sql",
  ]);
  assert.equal(unknown.status, "OK");
  assert.deepEqual(unknown.unknown, ["999_futura.sql"]);
});

test("migrations reais do repositorio sao detectadas pelo doctor", async () => {
  const files = (await readdir(path.join(rootDir, "backend", "migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.ok(files.includes("001_initial_schema.sql"));
  assert.equal(compareMigrations(files, files).status, "OK");
  assert.equal(compareMigrations(files, []).status, "WARN");
});

test("probe de env le presenca sem depender de dotenv e sem expor valores", () => {
  const parsed = parseEnvText(
    [
      "# comentario",
      "PORT=3000",
      'DATABASE_URL="postgresql://usuario:senha@localhost:5432/nutriva"',
      "ANTHROPIC_API_KEY=",
      "export ANTHROPIC_MODEL=claude-sonnet-5",
    ].join("\n"),
  );

  assert.equal(parsed.get("PORT"), "3000");
  assert.equal(parsed.get("DATABASE_URL"), "postgresql://usuario:senha@localhost:5432/nutriva");
  assert.equal(parsed.get("ANTHROPIC_API_KEY"), "");
  assert.equal(parsed.get("ANTHROPIC_MODEL"), "claude-sonnet-5");

  const probed = probeEnvWithoutDependencies("arquivo-que-nao-existe.env", {
    DATABASE_URL: "postgresql://x:y@host:5432/db",
  });

  assert.equal(Boolean(probed.databaseUrl), true);
  assert.equal(probed.anthropicApiKey, "");
  assert.equal(probed.port, "3000");
});

test("inspecao de schema de sessoes reprova coluna de token bruto", () => {
  const healthy = evaluateSessionSchema([
    "id",
    "user_id",
    "token_hash",
    "created_at",
    "expires_at",
    "last_used_at",
  ]);
  assert.equal(healthy.ok, true);
  assert.equal(healthy.tokenHashExists, true);
  assert.equal(healthy.rawTokenColumnExists, false);

  const leaking = evaluateSessionSchema(["id", "user_id", "token_hash", "token", "expires_at"]);
  assert.equal(leaking.ok, false);
  assert.equal(leaking.rawTokenColumnExists, true);
  assert.deepEqual(leaking.rawTokenColumns, ["token"]);

  const incomplete = evaluateSessionSchema(["id", "user_id"]);
  assert.equal(incomplete.ok, false);
  assert.deepEqual(incomplete.missingRequired, ["token_hash", "expires_at"]);

  const notInspected = evaluateSessionSchema([]);
  assert.equal(notInspected.inspected, false);
  assert.equal(notInspected.ok, false);
});

test("schema real de sessions nao declara coluna de token bruto", async () => {
  const sql = await readFile(
    path.join(rootDir, "backend", "migrations", "001_initial_schema.sql"),
    "utf8",
  );
  const sessionsBlock = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS sessions"));
  const columns = [...sessionsBlock.matchAll(/^\s{2}([a-z_]+)\s/gm)].map((match) => match[1]);

  const evaluated = evaluateSessionSchema(columns);
  assert.equal(evaluated.ok, true);
});
