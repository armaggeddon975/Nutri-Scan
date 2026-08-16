import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";

async function withServer(callback) {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("health sem DATABASE_URL retorna banco nao configurado", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.equal(body.database, env.databaseUrl ? "error" : "not_configured");
    assert.equal(body.ai, env.anthropicApiKey ? "configured" : "not_configured");
    assert.equal(body.aiProvider, "anthropic");
    assert.equal(body.version, "0.6.6");
    assert.equal("environment" in body, false);
  });
});

test("logout sem cookie e idempotente mesmo sem banco configurado", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0|Expires=/i);
  });
});

test("logout com token e banco indisponivel ainda envia limpeza do cookie", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: `${env.sessionCookieName}=token-aleatorio` },
    });
    const body = await response.json();

    assert.equal(response.status, env.databaseUrl ? 200 : 503);
    assert.match(response.headers.get("set-cookie") || "", /Max-Age=0|Expires=/i);
    if (!env.databaseUrl) {
      assert.equal(body.error.code, "DATABASE_NOT_CONFIGURED");
    }
  });
});
