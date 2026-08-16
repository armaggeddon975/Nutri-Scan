import { existsSync, readFileSync } from "node:fs";

// Leitor minimo de .env usando apenas built-ins.
// Serve para o Doctor diagnosticar o ambiente antes de dotenv existir.
// Ele nunca imprime valores; quem consome so recebe presenca/ausencia.

export function parseEnvText(text) {
  const values = new Map();

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();

    const quoted =
      (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (quoted && value.length >= 2) value = value.slice(1, -1);

    if (key) values.set(key, value);
  }

  return values;
}

export function readEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return new Map();
  try {
    return parseEnvText(readFileSync(filePath, "utf8"));
  } catch {
    return new Map();
  }
}

export function probeEnvWithoutDependencies(envFilePath, processEnv = process.env) {
  const fileValues = readEnvFile(envFilePath);
  const read = (key) => processEnv[key] || fileValues.get(key) || "";

  return {
    source: "env-probe",
    version: "",
    databaseUrl: read("DATABASE_URL"),
    databaseSsl: read("DATABASE_SSL") === "true",
    anthropicApiKey: read("ANTHROPIC_API_KEY"),
    anthropicModel: read("ANTHROPIC_MODEL"),
    port: read("PORT") || "3000",
    frontendOrigin: read("FRONTEND_ORIGIN") || "http://localhost:5173",
  };
}
