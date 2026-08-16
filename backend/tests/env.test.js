import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const envPath = path.join(backendRoot, ".env");
const envModuleUrl = pathToFileURL(path.join(backendRoot, "src/config/env.js")).href;

function runEnvProbe(extraEnv = {}) {
  const script = `
    const { env } = await import(${JSON.stringify(`${envModuleUrl}?t=${Date.now()}-${Math.random()}`)});
    console.log(JSON.stringify({
      nodeEnv: env.nodeEnv,
      port: env.port,
      databaseUrl: env.databaseUrl,
      databaseSsl: env.databaseSsl,
      sessionTtlDays: env.sessionTtlDays,
      version: env.version,
      anthropicModel: env.anthropicModel,
      anthropicTimeoutMs: env.anthropicTimeoutMs,
      anthropicMaxOutputTokens: env.anthropicMaxOutputTokens
    }));
  `;

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: backendRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...extraEnv,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function withTemporaryEnv(content, callback) {
  const original = existsSync(envPath) ? await readFile(envPath, "utf8") : null;
  await writeFile(envPath, content, "utf8");

  try {
    return await callback();
  } finally {
    if (original === null) {
      await rm(envPath, { force: true });
    } else {
      await writeFile(envPath, original, "utf8");
    }
  }
}

test("carrega backend/.env por caminho absoluto e valida valores", async () => {
  await withTemporaryEnv(
    [
      "NODE_ENV=test",
      "PORT=4312",
      "DATABASE_URL=postgresql://env-file.example/nutriscan",
      "DATABASE_SSL=true",
      "SESSION_TTL_DAYS=12",
      "ANTHROPIC_MODEL=claude-modelo-de-teste",
      "ANTHROPIC_TIMEOUT_MS=1234",
      "ANTHROPIC_MAX_OUTPUT_TOKENS=567",
      "",
    ].join("\n"),
    async () => {
      const env = runEnvProbe();
      assert.equal(env.nodeEnv, "test");
      assert.equal(env.port, 4312);
      assert.equal(env.databaseUrl, "postgresql://env-file.example/nutriscan");
      assert.equal(env.databaseSsl, true);
      assert.equal(env.sessionTtlDays, 12);
      assert.equal(env.version, "0.6.7");
      assert.equal(env.anthropicModel, "claude-modelo-de-teste");
      assert.equal(env.anthropicTimeoutMs, 1234);
      assert.equal(env.anthropicMaxOutputTokens, 567);
    },
  );
});

test("variaveis do sistema prevalecem sobre backend/.env", async () => {
  await withTemporaryEnv("PORT=4312\nDATABASE_SSL=false\nSESSION_TTL_DAYS=12\n", async () => {
    const env = runEnvProbe({
      PORT: "4999",
      DATABASE_SSL: "true",
      SESSION_TTL_DAYS: "22",
    });

    assert.equal(env.port, 4999);
    assert.equal(env.databaseSsl, true);
    assert.equal(env.sessionTtlDays, 22);
  });
});

test("valores invalidos de ambiente caem em defaults seguros", async () => {
  await withTemporaryEnv(
    "NODE_ENV=staging\nPORT=abc\nDATABASE_SSL=talvez\nSESSION_TTL_DAYS=0\nANTHROPIC_TIMEOUT_MS=abc\nANTHROPIC_MAX_OUTPUT_TOKENS=-1\n",
    async () => {
      const env = runEnvProbe();
      assert.equal(env.nodeEnv, "development");
      assert.equal(env.port, 3000);
      assert.equal(env.databaseSsl, false);
      assert.equal(env.sessionTtlDays, 30);
      assert.equal(env.anthropicTimeoutMs, 20000);
      assert.equal(env.anthropicMaxOutputTokens, 1200);
    },
  );
});
