import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { closePool, query } from "../src/database/pool.js";
import { hashSessionToken } from "../src/utils/sessionToken.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const hasDatabase = Boolean(env.databaseUrl);

after(async () => {
  await closePool();
});

function runMigrations() {
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: backendRoot,
    stdio: "pipe",
    env: process.env,
  });
}

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

function createAgent(baseUrl) {
  const cookies = new Map();

  return {
    getCookie(name) {
      return cookies.get(name);
    },
    async request(pathname, options = {}) {
      const headers = {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(cookies.size
          ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") }
          : {}),
        ...(options.headers || {}),
      };

      const response = await fetch(`${baseUrl}${pathname}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const setCookie = response.headers.get("set-cookie");
      if (setCookie) {
        const [pair] = setCookie.split(";");
        const [name, value] = pair.split("=");
        if (!value) cookies.delete(name);
        else cookies.set(name, value);
      }

      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body: text ? JSON.parse(text) : {},
      };
    },
  };
}

async function cleanupTestUsers() {
  await query("DELETE FROM users WHERE email LIKE 'codex-test-%@example.com'");
}

test(
  "fluxo real: cadastro, me, alergias, logout e login recuperando alergias",
  { skip: hasDatabase ? false : "NAO EXECUTADO - PostgreSQL nao disponivel" },
  async () => {
    runMigrations();
    await cleanupTestUsers();

    await withServer(async (baseUrl) => {
      const agent = createAgent(baseUrl);
      const email = `codex-test-${Date.now()}@example.com`;

      const register = await agent.request("/api/auth/register", {
        method: "POST",
        body: {
          name: `Codex Test ${Date.now()}`,
          email,
          password: "senha123",
          allergies: [],
        },
      });

      assert.equal(register.status, 201);
      assert.ok(agent.getCookie(env.sessionCookieName));
      assert.equal(register.body.user.email, email);

      const me = await agent.request("/api/auth/me");
      assert.equal(me.status, 200);
      assert.equal(me.body.user.email, email);

      const update = await agent.request("/api/profile/allergies", {
        method: "PUT",
        body: { allergies: ["milk"] },
      });
      assert.equal(update.status, 200);
      assert.deepEqual(update.body.user.allergies, ["milk"]);

      const profile = await agent.request("/api/profile");
      assert.equal(profile.status, 200);
      assert.deepEqual(profile.body.user.allergies, ["milk"]);

      const logout = await agent.request("/api/auth/logout", { method: "POST" });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0|Expires=/i);

      const meAfterLogout = await agent.request("/api/auth/me");
      assert.equal(meAfterLogout.status, 401);

      const login = await agent.request("/api/auth/login", {
        method: "POST",
        body: { identifier: email, password: "senha123" },
      });
      assert.equal(login.status, 200);
      assert.deepEqual(login.body.user.allergies, ["milk"]);
    });
  },
);

test(
  "multi-dispositivo simulado sincroniza alergias entre dois clientes",
  { skip: hasDatabase ? false : "NAO EXECUTADO - PostgreSQL nao disponivel" },
  async () => {
    runMigrations();
    await cleanupTestUsers();

    await withServer(async (baseUrl) => {
      const clientA = createAgent(baseUrl);
      const clientB = createAgent(baseUrl);
      const email = `codex-test-${Date.now()}-sync@example.com`;
      const password = "senha123";

      await clientA.request("/api/auth/register", {
        method: "POST",
        body: { name: `Sync ${Date.now()}`, email, password, allergies: [] },
      });

      await clientA.request("/api/profile/allergies", {
        method: "PUT",
        body: { allergies: ["milk"] },
      });

      const loginB = await clientB.request("/api/auth/login", {
        method: "POST",
        body: { identifier: email, password },
      });
      assert.deepEqual(loginB.body.user.allergies, ["milk"]);

      await clientB.request("/api/profile/allergies", {
        method: "PUT",
        body: { allergies: ["milk", "peanut"] },
      });

      const profileA = await clientA.request("/api/profile");
      assert.deepEqual(profileA.body.user.allergies, ["milk", "peanut"]);
    });
  },
);

test(
  "contas permanecem isoladas",
  { skip: hasDatabase ? false : "NAO EXECUTADO - PostgreSQL nao disponivel" },
  async () => {
    runMigrations();
    await cleanupTestUsers();

    await withServer(async (baseUrl) => {
      const accountA = createAgent(baseUrl);
      const accountB = createAgent(baseUrl);
      const suffix = Date.now();

      await accountA.request("/api/auth/register", {
        method: "POST",
        body: {
          name: `Isolamento A ${suffix}`,
          email: `codex-test-${suffix}-a@example.com`,
          password: "senha123",
          allergies: ["milk"],
        },
      });
      await accountB.request("/api/auth/register", {
        method: "POST",
        body: {
          name: `Isolamento B ${suffix}`,
          email: `codex-test-${suffix}-b@example.com`,
          password: "senha123",
          allergies: ["peanut"],
        },
      });

      const profileA = await accountA.request("/api/profile");
      const profileB = await accountB.request("/api/profile");

      assert.deepEqual(profileA.body.user.allergies, ["milk"]);
      assert.deepEqual(profileB.body.user.allergies, ["peanut"]);
    });
  },
);

test(
  "logout sem sessao ou com token desconhecido limpa cookie de forma controlada",
  { skip: hasDatabase ? false : "NAO EXECUTADO - PostgreSQL nao disponivel" },
  async () => {
    runMigrations();

    await withServer(async (baseUrl) => {
      const withoutCookie = createAgent(baseUrl);
      const noCookieLogout = await withoutCookie.request("/api/auth/logout", { method: "POST" });
      assert.equal(noCookieLogout.status, 200);

      const unknownToken = createAgent(baseUrl);
      const tokenLogout = await unknownToken.request("/api/auth/logout", {
        method: "POST",
        headers: { Cookie: `${env.sessionCookieName}=token-inexistente` },
      });

      assert.equal(tokenLogout.status, 200);
      assert.match(tokenLogout.headers.get("set-cookie") || "", /Max-Age=0|Expires=/i);
    });
  },
);

test(
  "sessao expirada deixa de autenticar",
  { skip: hasDatabase ? false : "NAO EXECUTADO - PostgreSQL nao disponivel" },
  async () => {
    runMigrations();
    await cleanupTestUsers();

    await withServer(async (baseUrl) => {
      const agent = createAgent(baseUrl);
      const email = `codex-test-${Date.now()}-expired@example.com`;

      await agent.request("/api/auth/register", {
        method: "POST",
        body: {
          name: `Expired ${Date.now()}`,
          email,
          password: "senha123",
          allergies: [],
        },
      });

      const token = agent.getCookie(env.sessionCookieName);
      assert.ok(token);

      await query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [
        hashSessionToken(token),
      ]);

      const me = await agent.request("/api/auth/me");
      assert.equal(me.status, 401);
      assert.equal(me.body.error.code, "UNAUTHENTICATED");
    });
  },
);
