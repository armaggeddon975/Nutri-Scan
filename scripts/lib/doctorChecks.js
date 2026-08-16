// Logica pura do Doctor. Sem dependencias externas e sem I/O,
// para poder ser testada com fixtures e executada sem node_modules.

export const FRONTEND_REQUIRED_MODULES = ["vite", "react", "react-dom"];
export const BACKEND_REQUIRED_MODULES = ["express", "pg", "dotenv", "@anthropic-ai/sdk"];

export const STRICT_REQUIRED_KEYS = [
  "frontendDependencies",
  "backendDependencies",
  "databaseUrl",
  "postgres",
  "migrations",
  "anthropicApiKey",
  "anthropicModel",
];

export function summarizeDependencies({ hasDirectory, modules, canResolve }) {
  const missing = modules.filter((moduleName) => !canResolve(moduleName));
  return {
    hasDirectory: Boolean(hasDirectory),
    checked: modules.length,
    missing,
    complete: Boolean(hasDirectory) && missing.length === 0,
  };
}

export function describeDependencies(summary, installCommand) {
  if (summary.complete) {
    return { status: "OK", detail: `installed (${summary.checked} modules resolved)` };
  }

  if (!summary.hasDirectory) {
    return { status: "WARN", detail: `run ${installCommand}` };
  }

  return {
    status: "WARN",
    detail: `incomplete, missing ${summary.missing.join(", ")} - run ${installCommand}`,
  };
}

export function compareMigrations(expectedFiles, appliedFiles) {
  const expected = [...expectedFiles].sort();
  const applied = [...appliedFiles].sort();
  const appliedSet = new Set(applied);
  const pending = expected.filter((file) => !appliedSet.has(file));
  const expectedSet = new Set(expected);
  const unknown = applied.filter((file) => !expectedSet.has(file));

  if (!expected.length) {
    return { status: "WARN", detail: "no migration files found", pending, unknown };
  }

  if (pending.length) {
    return {
      status: "WARN",
      detail: `pending ${pending.join(", ")} - run npm run db:migrate`,
      pending,
      unknown,
    };
  }

  const unknownNote = unknown.length ? `, ${unknown.length} unknown in database` : "";
  return {
    status: "OK",
    detail: `${expected.length}/${expected.length} applied${unknownNote}`,
    pending,
    unknown,
  };
}

export function evaluateStrict(checks, requiredKeys = STRICT_REQUIRED_KEYS) {
  const byKey = new Map(checks.map((check) => [check.key, check]));
  const failures = requiredKeys
    .map((key) => ({ key, check: byKey.get(key) }))
    .filter(({ check }) => !check || check.status !== "OK")
    .map(({ key, check }) => ({
      key,
      label: check?.label || key,
      detail: check ? check.detail : "not checked",
    }));

  return { ok: failures.length === 0, failures };
}
