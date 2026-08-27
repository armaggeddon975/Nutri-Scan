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

test("health reporta o estado real do banco e da IA, sem vazar configuracao", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    // Sem DATABASE_URL a resposta e sempre not_configured. Com ela, depende de
    // o banco estar acessivel: `connected` num ambiente real, `error` quando a
    // string aponta para um banco inalcancavel. As duas sao respostas honestas.
    if (env.databaseUrl) {
      assert.ok(
        ["connected", "error"].includes(body.database),
        `database inesperado com DATABASE_URL configurada: ${body.database}`,
      );
    } else {
      assert.equal(body.database, "not_configured");
    }
    assert.equal(body.ai, env.anthropicApiKey ? "configured" : "not_configured");
    assert.equal(body.aiProvider, "anthropic");
    assert.equal(body.version, "0.6.8");
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
