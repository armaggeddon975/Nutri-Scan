import { writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { backendDir, npmCommand, rootDir, statusLine } from "./common.js";
import { startBackendProcess, stopBackendProcess, waitForHealth } from "./lib/backendProcess.js";
import { BACKEND_REQUIRED_MODULES, summarizeDependencies } from "./lib/doctorChecks.js";
import { createModuleResolver, createRequireFrom } from "./lib/moduleProbe.js";
import { inspectSessionSchema } from "./lib/sessionSchema.js";
import { findMissingRequirements, validateAssistantAnswerShape } from "./lib/e2eGate.js";
import { analyzeProductAllergens } from "../shared/allergenEngine.js";
import { decideAssistantFallback } from "../src/services/assistantFallback.js";

const MAX_ANTHROPIC_CALLS = 2;
const ANTHROPIC_CALL_SPACING_MS = 1500;
const STARTUP_TIMEOUT_MS = Number.parseInt(process.env.E2E_STARTUP_TIMEOUT_MS || "30000", 10);

const E2E_PRODUCT = {
  name: "Chocolate E2E",
  ingredients_text: "leite integral, açúcar, cacau",
};

const backendPackageJson = path.join(backendDir, "package.json");

function parseOptions(argv) {
  return {
    strict: argv.includes("--strict"),
    report: argv.includes("--report") || process.env.E2E_WRITE_REPORT === "true",
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sanitizeBaseUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function ensureBackendDependencies() {
  const summary = summarizeDependencies({
    hasDirectory: existsSync(path.join(backendDir, "node_modules")),
    modules: BACKEND_REQUIRED_MODULES,
    canResolve: createModuleResolver(backendPackageJson),
  });

  if (!summary.complete) {
    const missing = summary.hasDirectory ? ` (missing ${summary.missing.join(", ")})` : "";
    throw new Error(
      `dependencias do backend ausentes${missing}. Rode: npm --prefix backend install`,
    );
  }
}

function backendModuleUrl(...segments) {
  return pathToFileURL(path.join(backendDir, "src", ...segments)).href;
}

class CookieClient {
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  storeCookies(headers) {
    const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    const values = raw.length ? raw : headers.get("set-cookie") ? [headers.get("set-cookie")] : [];
    for (const value of values) {
      const pair = value.split(";")[0];
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      const key = pair.slice(0, index);
      const cookieValue = pair.slice(index + 1);
      if (!cookieValue) this.cookies.delete(key);
      else this.cookies.set(key, cookieValue);
    }
  }

  async request(pathname, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    this.storeCookies(response.headers);
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return { response, data };
  }
}

function publicUserLooksSafe(user) {
  const text = JSON.stringify(user);
  return !/password|hash|salt|token|cookie/i.test(text);
}

function assertAllergies(user, expected) {
  assert(
    JSON.stringify(user.allergies || []) === JSON.stringify(expected),
    `expected allergies ${expected.join(",")}`,
  );
}

function createMockAnthropicClient(captured, answer = "Resposta de teste deterministica.") {
  return {
    messages: {
      create: async (payload) => {
        captured.push(payload);
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                answer,
                category: "allergy",
                safety: "caution",
                usedProductContext: true,
              }),
            },
          ],
        };
      },
    },
  };
}

function readSnapshotFromPayload(payload) {
  const lastMessage = payload.messages[payload.messages.length - 1];
  return JSON.parse(lastMessage.content[0].text).context?.allergySnapshot || {};
}

async function createDbClient(env) {
  if (!env.databaseUrl) return null;
  const requireFromBackend = createRequireFrom(backendPackageJson);
  const { Client } = requireFromBackend("pg");
  const client = new Client({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  return client;
}

async function cleanupUsers(db, emails) {
  if (!db || !emails.length) return;
  // Tipagem explicita do array evita ambiguidade do driver e mantem o DELETE
  // restrito exatamente aos e-mails temporarios desta execucao.
  await db.query("DELETE FROM users WHERE email = ANY($1::text[])", [emails]);
}

async function checkPrivacyForProviderPayload(answerAssistantChat) {
  const captured = [];
  const mockClient = createMockAnthropicClient(captured, "Produto com conflito declarado.");

  await answerAssistantChat(
    { user: null },
    {
      message: "Posso consumir esse produto?",
      conversation: [],
      product: { name: "Chocolate teste", ingredients_text: "leite integral, acucar, cacau" },
      guestAllergies: ["milk"],
    },
    mockClient,
  );

  const payloadText = JSON.stringify(captured[0]);
  const snapshot = readSnapshotFromPayload(captured[0]);
  const forbiddenPatterns = [
    /"email"\s*:/i,
    /"password"\s*:/i,
    /password_hash/i,
    /password_salt/i,
    /DATABASE_URL/i,
    /ANTHROPIC_API_KEY/i,
    /nutriscan_session=/i,
    /sk-ant-[A-Za-z0-9_-]{16,}/,
    /sk-(proj|svcacct|admin|live|test)-[A-Za-z0-9_-]{16,}/,
  ];

  return {
    ok: forbiddenPatterns.every((pattern) => !pattern.test(payloadText)),
    hasDeclaredConflict: snapshot.hasDeclaredConflict === true,
  };
}

function assertAssistantAnswerShape(body, categories, safetyLevels) {
  const shape = validateAssistantAnswerShape(body, categories, safetyLevels);
  assert(shape.ok, `resposta real da IA invalida: ${shape.problems.join("; ")}`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const log = (status, label, detail) => console.log(statusLine(status, label, detail));

  ensureBackendDependencies();

  const { env } = await import(backendModuleUrl("config", "env.js"));
  const { closePool } = await import(backendModuleUrl("database", "pool.js"));
  const { answerAssistantChat } = await import(backendModuleUrl("ai", "assistantService.js"));
  const { buildAllergySnapshot, buildAssistantProductContext } = await import(
    backendModuleUrl("ai", "contextBuilder.js")
  );
  const { ASSISTANT_CATEGORIES, ASSISTANT_SAFETY_LEVELS } = await import(
    backendModuleUrl("ai", "assistantPrompt.js")
  );

  const externalBaseUrl = (process.env.E2E_BASE_URL || "").trim();
  const baseUrl = externalBaseUrl || `http://127.0.0.1:${env.port}/api`;

  const anthropicFlagEnabled = process.env.RUN_ANTHROPIC_INTEGRATION_TESTS === "true";
  const anthropicRequired = process.env.E2E_REQUIRE_ANTHROPIC === "true";

  // FAIL BEFORE CALL: nunca habilitamos a flag automaticamente e nunca chamamos
  // a Anthropic paga sem autorizacao explicita.
  if (anthropicRequired && !anthropicFlagEnabled) {
    throw new Error("Anthropic exigido, mas RUN_ANTHROPIC_INTEGRATION_TESTS nao esta habilitado (FAIL BEFORE CALL)");
  }
  if (anthropicFlagEnabled && !env.anthropicApiKey && (options.strict || anthropicRequired)) {
    throw new Error("RUN_ANTHROPIC_INTEGRATION_TESTS habilitado, mas ANTHROPIC_API_KEY nao esta configurada (FAIL BEFORE CALL)");
  }

  const runAnthropic = anthropicFlagEnabled && Boolean(env.anthropicApiKey);
  const paidCallProtected = !anthropicFlagEnabled && Boolean(env.anthropicApiKey);
  let anthropicCalls = 0;

  const guardAnthropicCall = () => {
    anthropicCalls += 1;
    assert(anthropicCalls <= MAX_ANTHROPIC_CALLS, `limite de ${MAX_ANTHROPIC_CALLS} chamadas Anthropic excedido`);
  };

  const report = {
    version: env.version,
    mode: options.strict ? "strict" : "normal",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    baseUrl: sanitizeBaseUrl(baseUrl),
    backendProcess: "NOT_EXECUTED",
    database: "NOT_EXECUTED",
    migrations: "NOT_EXECUTED",
    auth: "NOT_EXECUTED",
    sessionSchema: "NOT_EXECUTED",
    multiDevice: "NOT_EXECUTED",
    isolation: "NOT_EXECUTED",
    logout: "NOT_EXECUTED",
    deterministicEngine: "NOT_EXECUTED",
    assistantGuest: "NOT_EXECUTED",
    assistantAuthenticated: "NOT_EXECUTED",
    assistantAuthority: "NOT_EXECUTED",
    fallback: "NOT_EXECUTED",
    privacy: "NOT_EXECUTED",
    anthropic: env.anthropicApiKey ? "configured" : "not_configured",
    anthropicReal: "NOT_EXECUTED",
    anthropicCalls: 0,
    ok: false,
  };

  let backendHandle = null;
  let signalHandler = null;

  // Falhas de etapas dependentes da Anthropic sao guardadas e relancadas depois
  // que as etapas independentes ja rodaram e reportaram o proprio estado.
  // Adiar nunca perdoa: o array e verificado antes de `report.ok = true`.
  const deferredFailures = [];
  const runDeferrable = async (label, run) => {
    try {
      await run();
    } catch (error) {
      deferredFailures.push({ label, message: error.message });
      log("WARN", label, `adiado - ${error.message}`);
    }
  };

  const stopBackend = async () => {
    if (!backendHandle) return;
    const handle = backendHandle;
    backendHandle = null;
    await stopBackendProcess(handle);
  };

  try {
    // 1. Migrations reais, duas vezes, para provar idempotencia.
    if (env.databaseUrl) {
      const firstMigration = await npmCommand(["run", "db:migrate"]);
      assert(firstMigration.code === 0, "primeira execucao de migrations falhou");
      const secondMigration = await npmCommand(["run", "db:migrate"]);
      assert(secondMigration.code === 0, "segunda execucao de migrations falhou");
      report.migrations = "EXECUTED_IDEMPOTENT";
      log("OK", "migrations", "aplicadas duas vezes (idempotente)");
    } else if (options.strict) {
      throw new Error("DATABASE_URL nao configurada; modo strict exige PostgreSQL real");
    } else {
      log("WARN", "migrations", "NAO EXECUTADO - DATABASE_URL ausente");
    }

    // 2. API: externa quando E2E_BASE_URL existe, senao subimos uma temporaria.
    if (externalBaseUrl) {
      report.backendProcess = "EXTERNAL";
      log("OK", "backend", `usando API externa ${sanitizeBaseUrl(baseUrl)}`);
    } else {
      backendHandle = startBackendProcess({ backendDir });
      report.backendProcess = "STARTED_BY_RUNNER";
      log("RUN", "backend", `iniciando API temporaria na porta ${env.port}`);

      signalHandler = () => {
        stopBackend().finally(() => process.exit(130));
      };
      process.on("SIGINT", signalHandler);
      process.on("SIGTERM", signalHandler);
    }

    let health;
    try {
      health = await waitForHealth(`${baseUrl}/health`, {
        timeoutMs: STARTUP_TIMEOUT_MS,
        isAlive: backendHandle ? backendHandle.isAlive : undefined,
      });
    } catch (error) {
      const tail = backendHandle ? `\n${backendHandle.getOutput().slice(-800)}` : "";
      throw new Error(`API nao respondeu /health: ${error.message}${tail}`);
    }

    assert(health.version === env.version, `health version deve ser ${env.version}`);
    assert(["ok", "degraded"].includes(health.status), "health status invalido");
    log("OK", "health", `status=${health.status} database=${health.database} ai=${health.ai}`);

    // 3. Motor deterministico (autoridade de alergia).
    const tracesScan = analyzeProductAllergens(
      { name: "Chocolate Teste", ingredients_text: "acucar, cacau", traces: "milk" },
      ["milk"],
    );
    const containsScan = analyzeProductAllergens({ ingredients_text: "leite integral, cacau" }, ["milk"]);
    assert(tracesScan.profileRisks[0]?.severity === "traces", "scan deterministico de traco falhou");
    assert(containsScan.profileRisks[0]?.severity === "contains", "scan deterministico de contains falhou");

    const traceSnapshot = buildAllergySnapshot(
      buildAssistantProductContext({ name: "Chocolate Teste", ingredients_text: "acucar, cacau", traces: "milk" }),
      ["milk"],
    );
    assert(traceSnapshot.hasTraceConflict === true, "snapshot de traco falhou");
    assert(traceSnapshot.hasDeclaredConflict === false, "traco nao pode virar conflito declarado");
    report.deterministicEngine = "PASSED";
    log("OK", "deterministic engine", "contains/traces conforme baseline");

    // 4. Privacidade do payload enviado a Anthropic (mock local, sem custo).
    const privacy = await checkPrivacyForProviderPayload(answerAssistantChat);
    assert(privacy.ok, "payload da Anthropic vazou dado sensivel");
    assert(privacy.hasDeclaredConflict, "payload da Anthropic precisa levar o snapshot deterministico");
    report.privacy = "PASSED";
    log("OK", "privacy", "payload sem segredos e com snapshot deterministico");

    // 5. Assistente como visitante.
    //
    // B2 (v0.6.8): as etapas que dependem da Anthropic passam a ser adiaveis.
    // Uma falha aqui era suficiente para abortar a execucao antes de o banco,
    // a autenticacao e o isolamento serem exercitados, e o relatorio saia com
    // `database: NOT_EXECUTED` mesmo com PostgreSQL acessivel. Adiar a falha
    // preserva o diagnostico sem afrouxar nada: `deferredFailures` e relancado
    // antes de `report.ok = true`, e os requisitos de `buildStrictRequirements`
    // continuam intactos.
    await runDeferrable("assistant guest", async () => {
    if (paidCallProtected) {
      report.assistantGuest = "SKIPPED_PAID_CALL_PROTECTED";
      log("WARN", "assistant guest", "NAO EXECUTADO - chave configurada sem RUN_ANTHROPIC_INTEGRATION_TESTS");
    } else {
      const guestMessage = runAnthropic ? "Em uma frase, explique o que e proteina." : "Explique proteina";
      if (runAnthropic) guardAnthropicCall();

      const guestResponse = await fetch(`${baseUrl}/assistant/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message: guestMessage, conversation: [], product: null, guestAllergies: [] }),
      });
      const guestBody = await guestResponse.json();

      if (runAnthropic) {
        assert(guestResponse.status === 200, "chamada real da Anthropic (visitante) falhou");
        assertAssistantAnswerShape(guestBody, ASSISTANT_CATEGORIES, ASSISTANT_SAFETY_LEVELS);
        report.assistantGuest = "PASSED";
        report.anthropicReal = "EXECUTED_GENERIC";
        log("OK", "anthropic real #1", "pergunta generica validada");
      } else if (guestResponse.status === 200) {
        assert(guestBody.answer, "assistente deve responder");
        report.assistantGuest = "PASSED";
      } else {
        assert(
          guestBody.error?.code === "AI_NOT_CONFIGURED",
          "erro do assistente deve ser AI_NOT_CONFIGURED quando a IA nao esta configurada",
        );
        report.assistantGuest = "AI_NOT_CONFIGURED";
        log("OK", "assistant guest", "AI_NOT_CONFIGURED conforme esperado");
      }
    }
    });

    // 6. Fallback: decisao real da funcao usada pelo frontend.
    const fallbackDecision = decideAssistantFallback({ code: "AI_NOT_CONFIGURED" });
    assert(fallbackDecision.source === "local", "AI_NOT_CONFIGURED deve cair para resposta local");
    assert(fallbackDecision.strategy === "local_answer", "AI_NOT_CONFIGURED deve usar o motor local");
    report.fallback = "PASSED";
    log("OK", "fallback", "AI_NOT_CONFIGURED -> source local");

    // 7. Fluxo real com PostgreSQL.
    if (health.database !== "connected") {
      if (options.strict) {
        throw new Error(`PostgreSQL nao conectado (health.database=${health.database}); modo strict exige banco real`);
      }
      report.database = "NOT_EXECUTED";
      log("WARN", "postgresql", "NAO EXECUTADO - banco nao conectado");
    } else {
      report.database = "EXECUTED";
      if (report.migrations === "NOT_EXECUTED") report.migrations = "CHECKED";

      const db = await createDbClient(env);
      const stamp = Date.now();
      const emailA = `nutriscan-e2e-${stamp}@example.test`;
      const emailB = `nutriscan-e2e-b-${stamp}@example.test`;
      const password = `E2E-${stamp}-senha`;
      const clientA = new CookieClient("A", baseUrl);
      const clientB = new CookieClient("B", baseUrl);
      const clientIso = new CookieClient("ISO", baseUrl);

      try {
        await cleanupUsers(db, [emailA, emailB]);

        const register = await clientA.request("/auth/register", {
          method: "POST",
          body: { name: `e2e-${stamp}`, email: emailA, password, allergies: [] },
        });
        assert(register.response.status === 201, "register deve retornar 201");
        assert(clientA.cookies.size > 0, "register deve enviar cookie");
        assert(publicUserLooksSafe(register.data.user), "user publico vazou campo sensivel");
        report.auth = "REGISTER_OK";

        // Inspecao real do schema de sessoes via information_schema.
        const schema = await inspectSessionSchema(db);
        assert(schema.inspected, "information_schema nao retornou colunas de sessions");
        assert(schema.tokenHashExists, "sessions precisa ter token_hash");
        assert(
          !schema.rawTokenColumnExists,
          `sessions nao pode ter coluna de token bruto: ${schema.rawTokenColumns.join(", ")}`,
        );
        assert(!schema.missingRequired.length, `sessions sem colunas obrigatorias: ${schema.missingRequired.join(", ")}`);

        const sessionRow = await db.query(
          "SELECT 1 FROM sessions WHERE user_id = $1 AND expires_at > now() LIMIT 1",
          [register.data.user.id],
        );
        assert(sessionRow.rowCount === 1, "sessao valida nao foi persistida");
        report.sessionSchema = "PASSED";
        log("OK", "session schema", "token_hash presente e sem coluna de token bruto");

        const me = await clientA.request("/auth/me");
        assert(me.response.status === 200, "auth/me deve retornar 200");
        assert(me.data.user.id === register.data.user.id, "auth/me deve retornar o mesmo usuario");

        const updateA = await clientA.request("/profile/allergies", {
          method: "PUT",
          body: { allergies: ["milk"] },
        });
        assert(updateA.response.status === 200, "update de alergias A deve retornar 200");
        assertAllergies(updateA.data.user, ["milk"]);

        const profileA = await clientA.request("/profile");
        assert(profileA.response.status === 200, "profile A deve retornar 200");
        assertAllergies(profileA.data.user, ["milk"]);

        // 7.1 Autoridade do PostgreSQL sobre guestAllergies do request.
        // Instrumentacao interna com mock: a API publica nao expoe o snapshot.
        const authorityCalls = [];
        const authorityResult = await answerAssistantChat(
          { user: { id: register.data.user.id } },
          {
            message: "Posso consumir esse produto?",
            conversation: [],
            product: E2E_PRODUCT,
            guestAllergies: ["soy"],
          },
          createMockAnthropicClient(authorityCalls),
        );
        const authoritySnapshot = readSnapshotFromPayload(authorityCalls[0]);
        assert(authorityResult.source === "anthropic", "fluxo autenticado deve chegar ao cliente de IA");
        assert(
          JSON.stringify(authoritySnapshot.profileAllergies) === JSON.stringify(["milk"]),
          `perfil oficial deve vir do PostgreSQL, recebido: ${JSON.stringify(authoritySnapshot.profileAllergies)}`,
        );
        assert(
          !authoritySnapshot.profileAllergies.includes("soy"),
          "guestAllergies do request nao pode sobrepor o perfil autenticado",
        );
        assert(authoritySnapshot.hasDeclaredConflict === true, "produto com leite deve gerar conflito declarado");
        assert(
          authoritySnapshot.detectedConflicts.includes("milk"),
          "conflito declarado deve conter milk",
        );
        report.assistantAuthority = "PASSED";
        log("OK", "assistant authority", "PostgreSQL vence guestAllergies e snapshot marca conflito");

        // 7.2 Assistente autenticado via HTTP, com o mesmo cookie.
        await runDeferrable("assistant authenticated", async () => {
        if (runAnthropic) {
          await delay(ANTHROPIC_CALL_SPACING_MS);
          guardAnthropicCall();
          const authedAssistant = await clientA.request("/assistant/chat", {
            method: "POST",
            body: {
              message: "Posso consumir esse produto?",
              conversation: [],
              product: E2E_PRODUCT,
              guestAllergies: [],
            },
          });
          assert(authedAssistant.response.status === 200, "chamada real da Anthropic (autenticado) falhou");
          assertAssistantAnswerShape(authedAssistant.data, ASSISTANT_CATEGORIES, ASSISTANT_SAFETY_LEVELS);
          report.assistantAuthenticated = "PASSED";
          report.anthropicReal = "EXECUTED_GENERIC_AND_PRODUCT";
          log("OK", "anthropic real #2", "produto com conflito validado com sessao autenticada");
        } else if (paidCallProtected) {
          report.assistantAuthenticated = "SKIPPED_PAID_CALL_PROTECTED";
          log("WARN", "assistant authenticated", "NAO EXECUTADO - chave configurada sem RUN_ANTHROPIC_INTEGRATION_TESTS");
        } else {
          const authedAssistant = await clientA.request("/assistant/chat", {
            method: "POST",
            body: {
              message: "Posso consumir esse produto?",
              conversation: [],
              product: E2E_PRODUCT,
              guestAllergies: [],
            },
          });
          assert(
            authedAssistant.response.status === 503 &&
              authedAssistant.data.error?.code === "AI_NOT_CONFIGURED",
            "assistente autenticado deve retornar AI_NOT_CONFIGURED sem IA configurada",
          );
          report.assistantAuthenticated = "AI_NOT_CONFIGURED";
          log("OK", "assistant authenticated", "rota autenticada alcancada, AI_NOT_CONFIGURED");
        }
        });

        const loginB = await clientB.request("/auth/login", {
          method: "POST",
          body: { identifier: emailA, password },
        });
        assert(loginB.response.status === 200, "login B deve retornar 200");
        assertAllergies(loginB.data.user, ["milk"]);

        const updateB = await clientB.request("/profile/allergies", {
          method: "PUT",
          body: { allergies: ["milk", "peanut"] },
        });
        assert(updateB.response.status === 200, "update de alergias B deve retornar 200");
        assertAllergies(updateB.data.user, ["milk", "peanut"]);

        const profileAAfterB = await clientA.request("/profile");
        assertAllergies(profileAAfterB.data.user, ["milk", "peanut"]);
        report.multiDevice = "PASSED";
        log("OK", "multi-device", "alergias sincronizadas entre dispositivos A e B");

        const registerIso = await clientIso.request("/auth/register", {
          method: "POST",
          body: { name: `e2e-b-${stamp}`, email: emailB, password, allergies: ["soy"] },
        });
        assert(registerIso.response.status === 201, "register da conta de isolamento deve retornar 201");
        assertAllergies(registerIso.data.user, ["soy"]);

        const profileAAfterIso = await clientA.request("/profile");
        assertAllergies(profileAAfterIso.data.user, ["milk", "peanut"]);
        report.isolation = "PASSED";
        log("OK", "isolation", "contas permanecem isoladas");

        const logout = await clientA.request("/auth/logout", { method: "POST" });
        assert(logout.response.status === 200, "logout deve retornar 200");
        const meAfterLogout = await clientA.request("/auth/me");
        assert(meAfterLogout.response.status === 401, "auth/me apos logout deve retornar 401");
        const secondLogout = await clientA.request("/auth/logout", { method: "POST" });
        assert(secondLogout.response.status === 200, "segundo logout nao pode quebrar");
        report.logout = "PASSED";
        report.auth = "PASSED";
        log("OK", "auth", "register, me, allergies, login, logout idempotente");
      } finally {
        // Cleanup roda mesmo em falha de login, assistente, Anthropic ou logout.
        await cleanupUsers(db, [emailA, emailB]).catch((error) => {
          console.error(statusLine("WARN", "cleanup", error.message));
        });
        await db?.end().catch(() => {});
      }
    }

    // Nenhuma falha adiada pode virar sucesso: ela volta a ser fatal aqui,
    // antes da avaliacao strict e antes de `report.ok`.
    if (deferredFailures.length) {
      throw new Error(
        `falha em etapa dependente da IA: ${deferredFailures.map((item) => `${item.label}: ${item.message}`).join(" | ")}`,
      );
    }

    if (options.strict) {
      const missing = findMissingRequirements(report, { anthropicFlagEnabled });
      if (missing.length) {
        throw new Error(`modo strict incompleto: ${missing.join(", ")}`);
      }
    }

    report.anthropicCalls = anthropicCalls;
    report.ok = true;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.anthropicCalls = anthropicCalls;

    await closePool().catch(() => {});
    await stopBackend();
    if (signalHandler) {
      process.off("SIGINT", signalHandler);
      process.off("SIGTERM", signalHandler);
    }

    if (options.report) {
      const reportPath = path.join(rootDir, "E2E_LAST_RUN.json");
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8").catch((error) => {
        console.error(statusLine("WARN", "report", error.message));
      });
    }

    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch((error) => {
  console.error(statusLine("FAIL", "E2E real", error.message));
  process.exitCode = 1;
});
