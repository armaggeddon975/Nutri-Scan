import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { backendDir, commandExists, maskConfigured, npmCommand, rootDir, statusLine } from "./common.js";
import {
  BACKEND_REQUIRED_MODULES,
  FRONTEND_REQUIRED_MODULES,
  compareMigrations,
  describeDependencies,
  evaluateStrict,
  summarizeDependencies,
} from "./lib/doctorChecks.js";
import { probeEnvWithoutDependencies } from "./lib/envProbe.js";
import { createModuleResolver, loadOptionalModule } from "./lib/moduleProbe.js";

// IMPORTANTE
// Este arquivo so pode importar built-ins do Node.js e modulos locais que tambem
// usem apenas built-ins. Dependencias reais (pg, dotenv, config do backend) sao
// carregadas sob demanda, depois de confirmarmos que podem ser resolvidas.
// Assim o Doctor continua util em uma copia recem-extraida do ZIP.

const backendPackageJson = path.join(backendDir, "package.json");
const rootPackageJson = path.join(rootDir, "package.json");
const backendEnvFile = path.join(backendDir, ".env");
const migrationsDir = path.join(backendDir, "migrations");

function parseOptions(argv) {
  return {
    strict: argv.some((arg) => arg === "--strict-e2e" || arg === "--strict"),
  };
}

async function checkNpmVersion() {
  const result = await npmCommand(["--version"]);
  return result.code === 0 ? result.stdout.trim() : "";
}

function checkDependencies({ packageJsonPath, nodeModulesPath, modules, installCommand }) {
  const summary = summarizeDependencies({
    hasDirectory: existsSync(nodeModulesPath),
    modules,
    canResolve: createModuleResolver(packageJsonPath),
  });
  return { summary, ...describeDependencies(summary, installCommand) };
}

async function loadBackendEnv(backendReady) {
  if (!backendReady) {
    return { env: probeEnvWithoutDependencies(backendEnvFile), loaded: false, reason: "backend dependencies missing" };
  }

  try {
    const moduleUrl = pathToFileURL(path.join(backendDir, "src", "config", "env.js")).href;
    const { env } = await import(moduleUrl);
    return { env, loaded: true, reason: "" };
  } catch (error) {
    return {
      env: probeEnvWithoutDependencies(backendEnvFile),
      loaded: false,
      reason: error.code || error.message,
    };
  }
}

async function readMigrationFiles() {
  try {
    const files = await readdir(migrationsDir);
    return files.filter((file) => file.endsWith(".sql")).sort();
  } catch {
    return [];
  }
}

async function inspectDatabase(env, backendReady) {
  const unavailable = (detail) => ({
    postgres: { status: "WARN", detail },
    migrations: { status: "WARN", detail: "not checked" },
  });

  if (!backendReady) return unavailable("not checked without backend dependencies");
  if (!env.databaseUrl) return unavailable("DATABASE_URL not configured");

  const pg = loadOptionalModule(backendPackageJson, "pg");
  if (!pg?.Client) return unavailable("pg module unavailable");

  const client = new pg.Client({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch {
    try {
      await client.end();
    } catch {
      // ignore cleanup errors
    }
    return {
      postgres: { status: "WARN", detail: "configured but inaccessible" },
      migrations: { status: "WARN", detail: "not checked without PostgreSQL" },
    };
  }

  let migrations;
  try {
    const applied = await client.query("SELECT filename FROM schema_migrations");
    migrations = compareMigrations(
      await readMigrationFiles(),
      applied.rows.map((row) => row.filename),
    );
  } catch {
    migrations = { status: "WARN", detail: "schema_migrations unavailable - run npm run db:migrate" };
  } finally {
    try {
      await client.end();
    } catch {
      // ignore cleanup errors
    }
  }

  return { postgres: { status: "OK", detail: "accessible" }, migrations };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const checks = [];

  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  checks.push({
    key: "node",
    label: "Node.js",
    status: nodeMajor >= 20 ? "OK" : "WARN",
    detail: process.versions.node,
  });

  const npmVersion = await checkNpmVersion();
  checks.push({
    key: "npm",
    label: "npm",
    status: npmVersion ? "OK" : "WARN",
    detail: npmVersion || "unavailable",
  });

  const frontend = checkDependencies({
    packageJsonPath: rootPackageJson,
    nodeModulesPath: path.join(rootDir, "node_modules"),
    modules: FRONTEND_REQUIRED_MODULES,
    installCommand: "npm install",
  });
  checks.push({
    key: "frontendDependencies",
    label: "Frontend dependencies",
    status: frontend.status,
    detail: frontend.detail,
  });

  const backend = checkDependencies({
    packageJsonPath: backendPackageJson,
    nodeModulesPath: path.join(backendDir, "node_modules"),
    modules: BACKEND_REQUIRED_MODULES,
    installCommand: "npm --prefix backend install",
  });
  checks.push({
    key: "backendDependencies",
    label: "Backend dependencies",
    status: backend.status,
    detail: backend.detail,
  });

  const backendReady = backend.status === "OK";
  const { env, loaded, reason } = await loadBackendEnv(backendReady);

  checks.push({
    key: "backendEnvFile",
    label: "backend/.env",
    status: existsSync(backendEnvFile) ? "OK" : "WARN",
    detail: existsSync(backendEnvFile) ? "found" : "not found",
  });

  checks.push({
    key: "envLoader",
    label: "Env loader",
    status: loaded ? "OK" : "WARN",
    detail: loaded ? "backend/src/config/env.js" : `built-in probe (${reason})`,
  });

  checks.push({
    key: "databaseUrl",
    label: "DATABASE_URL",
    status: env.databaseUrl ? "OK" : "WARN",
    detail: maskConfigured(env.databaseUrl),
  });

  const database = await inspectDatabase(env, backendReady);
  checks.push({ key: "postgres", label: "PostgreSQL", ...database.postgres });
  checks.push({ key: "migrations", label: "Migrations", ...database.migrations });

  checks.push({
    key: "anthropicApiKey",
    label: "ANTHROPIC_API_KEY",
    status: env.anthropicApiKey ? "OK" : "WARN",
    detail: maskConfigured(env.anthropicApiKey),
  });
  checks.push({
    key: "anthropicModel",
    label: "ANTHROPIC_MODEL",
    status: env.anthropicModel ? "OK" : "WARN",
    detail: env.anthropicModel || "not_configured",
  });
  checks.push({
    key: "anthropicIntegrationFlag",
    label: "RUN_ANTHROPIC_INTEGRATION_TESTS",
    status: "OK",
    detail: process.env.RUN_ANTHROPIC_INTEGRATION_TESTS === "true" ? "enabled" : "disabled",
  });

  checks.push({ key: "backendPort", label: "Backend port", status: "OK", detail: String(env.port) });
  checks.push({
    key: "frontendOrigin",
    label: "Frontend origin",
    status: "OK",
    detail: env.frontendOrigin,
  });

  const dockerAvailable = await commandExists("docker", ["--version"]);
  checks.push({
    key: "docker",
    label: "Docker",
    status: dockerAvailable ? "OK" : "WARN",
    detail: dockerAvailable ? "available" : "unavailable (optional)",
  });

  console.log(`NutriScan Doctor - modo ${options.strict ? "STRICT E2E" : "NORMAL"} (${rootDir})`);
  for (const check of checks) {
    console.log(statusLine(check.status, check.label, check.detail));
  }

  if (options.strict) {
    const { ok, failures } = evaluateStrict(checks);
    if (!ok) {
      for (const failure of failures) {
        console.error(statusLine("FAIL", `strict requirement: ${failure.label}`, failure.detail));
      }
      console.error(statusLine("FAIL", "Doctor strict-e2e", `${failures.length} requisito(s) obrigatorio(s) ausente(s)`));
      process.exitCode = 1;
      return;
    }
    console.log(statusLine("OK", "Doctor strict-e2e", "todos os requisitos obrigatorios atendidos"));
    return;
  }

  if (checks.some((check) => check.status === "FAIL")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(statusLine("FAIL", "Doctor", error.message));
  process.exitCode = 1;
});
