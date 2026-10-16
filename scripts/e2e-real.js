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
import { CONFLICT_MINIMUM_SAFETY, buildAllergyVerdict } from "../shared/allergyVerdict.js";
import {
  CODIGO_INVALIDO,
  DOIS_ENCONTRADOS,
  ENCONTRADO,
  ORIGEM_CAMERA,
  ORIGEM_MANUAL,
  consultarDoisProdutos,
  consultarProdutoPorCodigo,
} from "../src/services/productLookup.js";
import { analyzeComparedProduct } from "../shared/productComparison.js";
import { IDBFactory } from "fake-indexeddb";
import { VALID_ALLERGY_IDS } from "../shared/allergens.js";
import { criarCacheOffline } from "../src/services/offlineCache.js";
import { avaliarNoAparelho, consultarNoAparelho, guardarProdutoVisto, NO_APARELHO } from "../src/services/offlineLookup.js";
import { aoConfirmarConta, aoSairDaConta, recuperarSessao } from "../src/services/offlineSession.js";
import { decideAssistantFallback } from "../src/services/assistantFallback.js";

const MAX_ANTHROPIC_CALLS = 2;
const ANTHROPIC_CALL_SPACING_MS = 1500;
const STARTUP_TIMEOUT_MS = Number.parseInt(process.env.E2E_STARTUP_TIMEOUT_MS || "30000", 10);

const E2E_PRODUCT = {
  name: "Chocolate E2E",
  ingredients_text: "leite integral, açúcar, cacau",
};

// Codigos do subgate de consulta manual.
//
// O UPC-A e o EAN-13 sao o MESMO produto: `0` + UPC-A e o EAN-13
// correspondente, e o digito verificador nao muda. O invalido e o canonico com
// o ultimo digito trocado - exatamente a classe de erro que o digito
// verificador existe para pegar.
const CODIGO_MANUAL_UPCA = "036000291452";
const CODIGO_MANUAL_CANONICO = "0036000291452";
const CODIGO_MANUAL_INVALIDO = "0036000291453";

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

// ORCAMENTO DE REQUISICOES POR LIMITADOR (Q6 da auditoria da v0.7.1)
//
// A suite E2E fala com um servidor que tem tres limitadores ligados. Se ela
// encostar em qualquer um deles, o teste comeca a receber "Too many requests"
// em vez de JSON e quebra por um motivo que nao tem nada a ver com o que ele
// deveria estar verificando. Foi exatamente isso que aconteceu com a suite de
// integracao na v0.7.0, e o custo foi alto: os testes de isolamento entre
// contas passaram uma versao inteira sem nunca rodar.
//
// A correcao de contagem por usuario tira a pressao do limitador de colecoes,
// mas nao dos outros dois - auth e assistente continuam contando por IP, e
// nessa suite todos os clientes saem do mesmo IP. Entao a suite conta o que
// gasta e recusa passar se chegar perto do teto. Perto, e nao no teto: a
// margem existe para que um teste novo nao descubra o limite do jeito ruim.
const TETOS = { auth: 40, assistente: 20, colecoes: 300, exportacao: 5, comparacao: 30 };
const MARGEM = 0.5; // nenhum balde pode passar de metade do seu teto

// Colecoes tem DOIS tetos desde a v0.7.2: 300 por usuario e 3000 por IP. `teto`
// acima e o por usuario, que e o que a margem vigia. Ate a v0.7.6 o relatorio
// nao mostrava o por IP, e quem lia "teto 300" podia achar que era o unico.
// Toda a suite sai do mesmo IP, entao o gasto por IP e o mesmo numero.
// A exportacao (v0.8.0) tem o mesmo desenho: 5 por usuario e 20 por IP, por dia.
const TETOS_POR_IP = { colecoes: 3000, exportacao: 20, comparacao: 300 };

function tetoPorIpDe(balde, usado) {
  const tetoPorIp = TETOS_POR_IP[balde];
  return tetoPorIp ? { tetoPorIp, folgaPorIp: tetoPorIp - usado } : {};
}

const gastos = new Map();

function baldeDa(pathname, method, cliente) {
  const rota = pathname.split("?")[0];
  const metodo = (method || "GET").toUpperCase();

  // Auth conta por IP, e so em register e login - `me` e `logout` nao passam
  // pelo limitador. Todos os clientes da suite dividem o mesmo balde.
  if (metodo === "POST" && (rota === "/auth/register" || rota === "/auth/login")) return "auth";
  // Excluir a conta confere uma senha: passa pelo MESMO limitador do login.
  if (metodo === "DELETE" && rota === "/account") return "auth";
  if (metodo === "POST" && rota === "/assistant/chat") return "assistente";
  if (metodo === "GET" && rota === "/account/export") return "exportacao";
  // Comparacao (v0.10.0): balde proprio. A explicacao (/compare/explain) gasta
  // tambem o do assistente, mas o gate nao a chama por HTTP: ela e exercitada
  // dentro do processo, com modelo simulado, sem chamada paga.
  if (metodo === "POST" && rota.startsWith("/compare")) return "comparacao";

  // Colecoes conta por usuario. Separar por cliente pareceria mais preciso e
  // seria errado: `clientB` faz login com o e-mail de A, entao dois clientes
  // da suite sao a MESMA conta e dividem o mesmo balde. Um orcamento que se
  // engana para menos nao serve para nada, entao tudo cai num balde so - o
  // pior caso, em que todo cliente e a mesma pessoa.
  if (rota.startsWith("/history") || rota.startsWith("/favorites")) {
    return "colecoes";
  }
  return null;
}

function contar(pathname, method, cliente) {
  const balde = baldeDa(pathname, method, cliente);
  if (!balde) return;
  gastos.set(balde, (gastos.get(balde) ?? 0) + 1);
}

function orcamentoDeLimite() {
  const linhas = [];
  for (const [balde, usado] of [...gastos.entries()].sort()) {
    const teto = TETOS[balde];
    const permitido = Math.floor(teto * MARGEM);
    linhas.push({
      balde,
      usado,
      teto,
      margemMaxima: permitido,
      folga: teto - usado,
      ...tetoPorIpDe(balde, usado),
      dentroDaMargem: usado <= permitido,
    });
  }

  // Um balde com zero requisicao nao aparece no mapa, mas precisa aparecer no
  // relatorio: silencio nao e prova de que o limitador foi exercitado.
  for (const [familia, teto] of Object.entries(TETOS)) {
    if (!linhas.some((linha) => linha.balde === familia)) {
      linhas.push({
        balde: familia,
        usado: 0,
        teto,
        margemMaxima: Math.floor(teto * MARGEM),
        folga: teto,
        ...tetoPorIpDe(familia, 0),
        dentroDaMargem: true,
      });
    }
  }

  return {
    margem: `no maximo ${MARGEM * 100}% do teto`,
    baldes: linhas,
    estouraram: linhas.filter((linha) => !linha.dentroDaMargem).map((linha) => linha.balde),
  };
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

    contar(pathname, options.method, this.name);

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
  const { explicarComparacao } = await import(backendModuleUrl("services", "comparisonService.js"));
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
    historySync: "NOT_EXECUTED",
    favoritesSync: "NOT_EXECUTED",
    verdictFreshness: "NOT_EXECUTED",
    manualCodeLookup: "NOT_EXECUTED",
    accountExport: "NOT_EXECUTED",
    accountDeletion: "NOT_EXECUTED",
    severityVerdict: "NOT_EXECUTED",
    productComparison: "NOT_EXECUTED",
    offlineCache: "NOT_EXECUTED",
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

      // Esta chamada nao passa pelo CookieClient - e crua, de proposito, para
      // testar o visitante sem cookie. Mas ela gasta do balde do assistente
      // como qualquer outra, entao precisa ser contada na mao.
      contar("/assistant/chat", "POST", "visitante");

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
      // Conta D (v0.8.0): criada so para ser apagada pelo subgate de exclusao.
      // Identificador unico desta execucao, e na lista de limpeza mesmo assim -
      // se o subgate falhar antes de apagar, a limpeza apaga.
      const emailD = `nutriscan-e2e-d-${stamp}@example.test`;
      // Conta E (v0.11.0): a do subgate offlineCache, que termina em logout.
      const emailE = `nutriscan-e2e-e-${stamp}@example.test`;
      const password = `E2E-${stamp}-senha`;
      const clientA = new CookieClient("A", baseUrl);
      const clientB = new CookieClient("B", baseUrl);
      const clientIso = new CookieClient("ISO", baseUrl);

      try {
        await cleanupUsers(db, [emailA, emailB, emailD, emailE]);

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

        // ------------------------------------------------------------------
        // v0.7.0 - historico, favoritos e frescor do veredito
        //
        // Sao tres subgates separados de proposito. Um unico "colecoes"
        // esconderia qual das tres promessas quebrou, e o auditor externo
        // precisa saber se o problema foi sincronizar, isolar ou recalcular.
        // ------------------------------------------------------------------
        const produtoTeste = {
          productCode: `e2e-${stamp}`,
          productName: "Produto de teste E2E",
          productBrand: "Marca de teste",
          imageUrl: null,
        };

        // historySync: A grava, B le, e a conta de isolamento nao ve nada.
        const gravouHistorico = await clientA.request("/history", {
          method: "POST",
          body: produtoTeste,
        });
        assert(gravouHistorico.response.status === 201, "POST /history deve retornar 201");

        const historicoB = await clientB.request("/history");
        assert(historicoB.response.status === 200, "GET /history no dispositivo B deve retornar 200");
        assert(
          (historicoB.data.items || []).some((item) => item.productCode === produtoTeste.productCode),
          "dispositivo B nao viu o historico gravado por A",
        );

        const historicoIso = await clientIso.request("/history");
        assert(
          !(historicoIso.data.items || []).some((item) => item.productCode === produtoTeste.productCode),
          "conta de isolamento enxergou historico de outra conta",
        );
        report.historySync = "PASSED";
        log("OK", "history sync", "A gravou, B leu, conta isolada nao viu");

        // favoritesSync: mesma prova para favoritos.
        const gravouFavorito = await clientA.request("/favorites", {
          method: "POST",
          body: produtoTeste,
        });
        assert(gravouFavorito.response.status === 201, "POST /favorites deve retornar 201");

        const favoritosB = await clientB.request("/favorites");
        assert(
          (favoritosB.data.items || []).some((item) => item.productCode === produtoTeste.productCode),
          "dispositivo B nao viu o favorito gravado por A",
        );

        const favoritosIso = await clientIso.request("/favorites");
        assert(
          !(favoritosIso.data.items || []).some((item) => item.productCode === produtoTeste.productCode),
          "conta de isolamento enxergou favorito de outra conta",
        );

        // Remover item de outra conta responde igual a item inexistente.
        const idDoFavoritoDeA = (favoritosB.data.items || []).find(
          (item) => item.productCode === produtoTeste.productCode,
        )?.id;
        const tentativaIso = await clientIso.request(`/favorites/${idDoFavoritoDeA}`, {
          method: "DELETE",
        });
        assert(
          tentativaIso.response.status === 404,
          `remocao cruzada devolveu ${tentativaIso.response.status}, esperado 404`,
        );
        report.favoritesSync = "PASSED";
        log("OK", "favorites sync", "A gravou, B leu, remocao cruzada recusada com 404");

        // verdictFreshness: o item salvo nao carrega veredito, entao mudar o
        // perfil de alergia muda o que a tela mostra. Esta e a prova de que
        // nada foi congelado.
        const historicoAntes = await clientA.request("/history");
        const itemSalvo = (historicoAntes.data.items || []).find(
          (item) => item.productCode === produtoTeste.productCode,
        );
        assert(itemSalvo, "item de historico sumiu antes da checagem de veredito");
        for (const campo of ["allergyVerdict", "safety", "conflicts", "verdict", "allergens"]) {
          assert(
            itemSalvo[campo] === undefined,
            `item de historico carrega campo de veredito congelado: ${campo}`,
          );
        }

        const perfilAntes = await clientA.request("/profile");
        await clientA.request("/profile/allergies", {
          method: "PUT",
          body: { allergies: ["soy"] },
        });
        const perfilDepois = await clientA.request("/profile");
        assert(
          JSON.stringify(perfilAntes.data.user.allergies) !==
            JSON.stringify(perfilDepois.data.user.allergies),
          "o perfil de alergia nao mudou: a checagem de frescor seria vazia",
        );

        const historicoDepois = await clientA.request("/history");
        const itemDepois = (historicoDepois.data.items || []).find(
          (item) => item.productCode === produtoTeste.productCode,
        );
        assert(itemDepois, "item de historico sumiu depois da mudanca de perfil");
        assert(
          JSON.stringify(itemSalvo) === JSON.stringify(itemDepois),
          "o item guardado mudou junto com o perfil: ele carrega estado que nao deveria",
        );
        report.verdictFreshness = "PASSED";
        log("OK", "verdict freshness", "item salvo sem veredito; perfil muda sem alterar o registro");

        // -----------------------------------------------------------------
        // manualCodeLookup (v0.7.3)
        //
        // Ate a v0.7.2, o caminho principal do produto - o que decide qual
        // alimento a pessoa esta vendo - nunca tinha sido exercitado por gate
        // nenhum. A camera nao existe no ambiente de execucao, e a consulta
        // vivia dentro de um componente React. Esta etapa e a primeira vez que
        // esse caminho roda de ponta a ponta.
        //
        // A consulta usa `consultarProdutoPorCodigo`, que e a MESMA funcao que
        // `App.jsx` chama. A busca externa e injetada para que o gate nao
        // dependa da Open Food Facts estar no ar - o que se prova aqui e o
        // nosso caminho, nao a disponibilidade de terceiro.
        {
          const perfilManual = ["milk"];
          await clientA.request("/profile/allergies", {
            method: "PUT",
            body: { allergies: perfilManual },
          });

          const produtoDaBase = {
            code: CODIGO_MANUAL_CANONICO,
            product_name: E2E_PRODUCT.name,
            ingredients_text: E2E_PRODUCT.ingredients_text,
          };
          let buscasFeitas = 0;
          const buscarFalso = async (codigo) => {
            buscasFeitas += 1;
            return codigo === CODIGO_MANUAL_CANONICO ? produtoDaBase : null;
          };

          // 1. Codigo com digito verificador errado nao chega a rede.
          const recusado = await consultarProdutoPorCodigo(CODIGO_MANUAL_INVALIDO, {
            origem: ORIGEM_MANUAL,
            buscar: buscarFalso,
          });
          assert(
            recusado.estado === CODIGO_INVALIDO,
            `codigo invalido deveria ser recusado, veio ${recusado.estado}`,
          );
          assert(buscasFeitas === 0, "codigo invalido gerou requisicao de rede");

          // 2. UPC-A digitado normaliza para EAN-13 e encontra o produto.
          const manual = await consultarProdutoPorCodigo(CODIGO_MANUAL_UPCA, {
            origem: ORIGEM_MANUAL,
            buscar: buscarFalso,
          });
          assert(manual.estado === ENCONTRADO, `consulta manual falhou: ${manual.estado}`);
          assert(
            manual.codigo === CODIGO_MANUAL_CANONICO,
            `UPC-A nao normalizou: ${manual.codigo}`,
          );

          // 3. Paridade: o mesmo produto pelo caminho da camera.
          const camera = await consultarProdutoPorCodigo(CODIGO_MANUAL_CANONICO, {
            origem: ORIGEM_CAMERA,
            buscar: buscarFalso,
          });
          assert(
            JSON.stringify(manual.produto) === JSON.stringify(camera.produto),
            "o produto divergiu entre o caminho manual e o da camera",
          );

          // 4. O veredito vem do motor deterministico e marca o conflito, com
          //    piso de risco. O perfil que manda e o do PostgreSQL.
          const perfilNoBanco = await clientA.request("/profile");
          const alergiasDoBanco = perfilNoBanco.data.user.allergies || [];
          assert(
            alergiasDoBanco.includes("milk"),
            `o perfil do banco nao tem leite: ${JSON.stringify(alergiasDoBanco)}`,
          );

          const analiseManual = analyzeProductAllergens(manual.produto, alergiasDoBanco);
          const vereditoManual = buildAllergyVerdict({
            profileRisks: analiseManual.profileRisks,
            profileAllergies: alergiasDoBanco,
            hasProductContext: true,
          });
          assert(
            vereditoManual.status === "conflict",
            `veredito do caminho manual veio como ${vereditoManual.status}`,
          );
          assert(
            vereditoManual.minimumSafety === CONFLICT_MINIMUM_SAFETY,
            "o piso de risco nao foi aplicado no caminho manual",
          );
          assert(
            vereditoManual.source === "deterministic_engine",
            `o veredito nao veio do motor: ${vereditoManual.source}`,
          );

          const analiseCamera = analyzeProductAllergens(camera.produto, alergiasDoBanco);
          const vereditoCamera = buildAllergyVerdict({
            profileRisks: analiseCamera.profileRisks,
            profileAllergies: alergiasDoBanco,
            hasProductContext: true,
          });
          assert(
            JSON.stringify(vereditoManual) === JSON.stringify(vereditoCamera),
            "o veredito divergiu entre o caminho manual e o da camera",
          );

          // 5. O backend recusa o codigo invalido tambem por requisicao
          //    direta, sem passar pelo frontend.
          const gravacaoInvalida = await clientA.request("/history", {
            method: "POST",
            body: {
              productCode: CODIGO_MANUAL_INVALIDO,
              productName: E2E_PRODUCT.name,
              productBrand: null,
              imageUrl: null,
            },
          });
          assert(
            gravacaoInvalida.response.status === 400,
            `o backend aceitou codigo invalido: HTTP ${gravacaoInvalida.response.status}`,
          );

          // 6. E grava o valido, sem congelar veredito.
          const gravacaoValida = await clientA.request("/history", {
            method: "POST",
            body: {
              productCode: manual.codigo,
              productName: E2E_PRODUCT.name,
              productBrand: null,
              imageUrl: null,
            },
          });
          assert(
            gravacaoValida.response.status === 201,
            `o backend recusou codigo valido: HTTP ${gravacaoValida.response.status}`,
          );

          const historicoManual = await clientA.request("/history");
          const salvoManual = (historicoManual.data.items || []).find(
            (item) => item.productCode === manual.codigo,
          );
          assert(salvoManual, "a consulta manual nao entrou no historico");
          for (const campo of ["allergyVerdict", "safety", "conflicts", "verdict", "allergens"]) {
            assert(
              salvoManual[campo] === undefined,
              `o item da consulta manual carrega veredito congelado: ${campo}`,
            );
          }

          report.manualCodeLookup = "PASSED";
          log(
            "OK",
            "manual code lookup",
            "digito verificador barra antes da rede; manual e camera dao o mesmo veredito",
          );
        }

        // ------------------------------------------------------------------
        // v0.9.0 - severityVerdict: o nivel de alerta muda o que o MOTOR decide.
        //
        // O perfil e gravado pela API real, na rota de sempre, e lido de volta
        // por OUTRO aparelho da mesma conta (clientB). O veredito sai do codigo
        // do backend lendo esse perfil do PostgreSQL. O modelo e SIMULADO e
        // nega o conflito em todos os casos - e a unica forma de forcar o
        // modelo a negar, e assim nenhuma chamada paga a mais e feita. O que se
        // confere e o que chegaria ao cliente: `safety` e `allergyVerdict`.
        // ------------------------------------------------------------------
        {
          const niveisEsperados = { milk: "standard", peanut: "strict" };
          const gravado = await clientA.request("/profile/allergies", {
            method: "PUT",
            body: { allergies: ["milk", "peanut"], alertLevels: { peanut: "strict" } },
          });
          assert(gravado.response.status === 200, `gravar o nivel de alerta falhou (${gravado.response.status})`);
          assert(
            JSON.stringify(gravado.data.user.alertLevels) === JSON.stringify(niveisEsperados),
            `nivel gravado errado: ${JSON.stringify(gravado.data.user.alertLevels)}`,
          );
          const lidoPorB = await clientB.request("/profile");
          assert(
            JSON.stringify(lidoPorB.data.user.alertLevels) === JSON.stringify(niveisEsperados),
            "o nivel de alerta nao chegou ao outro aparelho da conta",
          );

          const modeloQueNega = {
            messages: {
              create: async () => ({
                stop_reason: "end_turn",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      answer: "Pode consumir sem preocupacao.",
                      category: "allergy",
                      safety: "normal",
                      usedProductContext: true,
                    }),
                  },
                ],
              }),
            },
          };
          const perguntar = (produto) =>
            answerAssistantChat(
              { user: { id: register.data.user.id } },
              { message: "Posso consumir esse produto?", conversation: [], product: produto, guestAllergies: [] },
              modeloQueNega,
              { logger: { warn: () => {} } },
            );

          // Alerta maximo (amendoim).
          const casosMaximo = [
            ["maximo + declarado", { name: "Pacoca E2E", ingredients_text: "amendoim torrado, acucar" }, "urgent", "declared"],
            ["maximo + traco", { name: "Biscoito E2E", ingredients_text: "farinha de arroz, sal", traces: ["peanuts"] }, "caution", "traces"],
          ];
          for (const [nome, produto, piso, origem] of casosMaximo) {
            const r = await perguntar(produto);
            assert(r.allergyVerdict.status === "conflict", `${nome}: status ${r.allergyVerdict.status}`);
            assert(r.allergyVerdict.minimumSafety === piso, `${nome}: piso ${r.allergyVerdict.minimumSafety}`);
            assert(r.safety === piso, `${nome}: o modelo negando derrubou o piso - chegou ${r.safety}`);
            const entrada = r.allergyVerdict.conflicts.find((c) => c.id === "peanut");
            assert(
              entrada?.origin === origem && entrada?.alertLevel === "strict",
              `${nome}: o veredito nao distingue origem e nivel: ${JSON.stringify(entrada)}`,
            );
          }

          // Alerta padrao (leite): o comportamento da v0.8.0.
          const declaradoPadrao = await perguntar({ name: "Leite E2E", ingredients_text: "leite integral" });
          assert(declaradoPadrao.safety === CONFLICT_MINIMUM_SAFETY, `padrao + declarado: chegou ${declaradoPadrao.safety}`);
          assert(
            JSON.stringify(declaradoPadrao.allergyVerdict.conflicts) === JSON.stringify([{ id: "milk", label: "Leite/lactose" }]),
            `padrao + declarado: o conflito ganhou campo: ${JSON.stringify(declaradoPadrao.allergyVerdict.conflicts)}`,
          );
          assert(declaradoPadrao.allergyVerdict.minimumSafety === CONFLICT_MINIMUM_SAFETY, "padrao + declarado: piso mudou");
          assert(
            declaradoPadrao.allergyVerdict.alert ===
              "Este produto tem Leite/lactose, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.",
            "padrao + declarado: o texto do alerta mudou",
          );
          const tracoPadrao = await perguntar({ name: "Bolacha E2E", ingredients_text: "farinha de arroz, sal", traces: ["milk"] });
          assert(
            tracoPadrao.allergyVerdict.status === "traces" &&
              tracoPadrao.allergyVerdict.conflicts.length === 0 &&
              tracoPadrao.allergyVerdict.minimumSafety === null &&
              tracoPadrao.safety === "normal",
            `padrao + traco: deveria seguir sem conflito e sem piso: ${JSON.stringify(tracoPadrao.allergyVerdict)}`,
          );

          report.severityVerdict = "PASSED";
          log(
            "OK",
            "severity verdict",
            "alerta maximo: urgent no declarado, caution no traco; padrao igual a v0.8.0; modelo negando nao derruba o piso",
          );
        }

        // ------------------------------------------------------------------
        // v0.10.0 - productComparison: dois produtos, um veredito por produto.
        //
        // As duas buscas vao pelo caminho de sempre (`consultarDoisProdutos`),
        // com a busca externa injetada para nao depender da Open Food Facts estar
        // no ar. A comparacao vai pela API REAL, com a sessao de A - o perfil sai
        // do PostgreSQL (leite padrao e amendoim em alerta maximo, gravados pelo
        // subgate anterior). A explicacao roda no processo, com um modelo
        // SIMULADO que troca a ordem das explicacoes e nega o conflito: nenhuma
        // chamada paga.
        // ------------------------------------------------------------------
        {
          const COD_LEITE = "7891000100103";
          const COD_PACOCA = "5449000000996";
          const produtos = {
            [COD_LEITE]: { product_name: "Leite E2E comparacao", ingredients_text: "leite integral, acucar" },
            [CODIGO_MANUAL_CANONICO]: { product_name: "Biscoito E2E comparacao", ingredients_text: "farinha de arroz, sal" },
            [COD_PACOCA]: { product_name: "Pacoca E2E comparacao", ingredients_text: "amendoim torrado, acucar" },
          };
          const buscas = [];
          const buscarFalso = async (codigo) => {
            buscas.push(codigo);
            return produtos[codigo] ?? null;
          };

          // 1. Codigo invalido em qualquer dos dois: nenhuma busca.
          const recusada = await consultarDoisProdutos(
            { entrada: COD_LEITE },
            { entrada: CODIGO_MANUAL_INVALIDO },
            { buscar: buscarFalso },
          );
          assert(recusada.estado === CODIGO_INVALIDO && buscas.length === 0, "codigo invalido na comparacao chegou a busca");

          // 2. UPC-A num e EAN-13 no outro: os dois canonicalizados.
          const consulta = await consultarDoisProdutos(
            { entrada: COD_LEITE },
            { entrada: CODIGO_MANUAL_UPCA },
            { buscar: buscarFalso },
          );
          assert(consulta.estado === DOIS_ENCONTRADOS, `a comparacao nao encontrou os dois: ${consulta.estado}`);
          assert(consulta.b.codigo === CODIGO_MANUAL_CANONICO, `o UPC-A nao foi canonicalizado: ${consulta.b.codigo}`);

          const par = (codigoA, codigoB) => ({
            products: [
              { code: codigoA, product: buildAssistantProductContext(produtos[codigoA]) },
              { code: codigoB, product: buildAssistantProductContext(produtos[codigoB]) },
            ],
            // Ignorado com sessao: o perfil e o do banco.
            guestAllergies: ["soy"],
            userId: "outra-pessoa",
          });

          // 3. API real, perfil do PostgreSQL: o limpo nao herda nada do outro.
          const perfilDoBanco = (await clientA.request("/profile")).data.user;
          const perfil = {
            profileAllergies: perfilDoBanco.allergies,
            alertLevels: perfilDoBanco.alertLevels,
            profileSource: "postgresql",
          };
          const comparada = await clientA.request("/compare", { method: "POST", body: par(COD_LEITE, CODIGO_MANUAL_CANONICO) });
          assert(comparada.response.status === 200, `comparacao deve retornar 200 (${comparada.response.status})`);
          assert(comparada.data.comparison.profileSource === "postgresql", "a comparacao nao usou o perfil do banco");
          const [leite, limpo] = comparada.data.comparison.products;
          assert(leite.code === COD_LEITE && limpo.code === CODIGO_MANUAL_CANONICO, "a ordem dos produtos mudou");
          for (const [produto, origem] of [[leite, produtos[COD_LEITE]], [limpo, produtos[CODIGO_MANUAL_CANONICO]]]) {
            const { safetyFloorApplied: _ignorado, ...veredito } = produto.allergyVerdict;
            const sozinho = analyzeComparedProduct(buildAssistantProductContext(origem), perfil).allergyVerdict;
            assert(
              JSON.stringify(veredito) === JSON.stringify(sozinho),
              `o veredito de ${produto.code} nao e o do produto calculado sozinho`,
            );
          }
          assert(leite.allergyVerdict.status === "conflict" && leite.safety === "caution", "o produto em conflito foi rebaixado");
          assert(limpo.allergyVerdict.status === "clear" && limpo.safety === "normal", "o produto limpo herdou o safety do outro");

          // 4. Alerta maximo: urgent so no produto certo.
          const estrita = await clientA.request("/compare", { method: "POST", body: par(COD_PACOCA, CODIGO_MANUAL_CANONICO) });
          const [pacoca, limpoDeNovo] = estrita.data.comparison.products;
          assert(pacoca.safety === "urgent", `o amendoim em alerta maximo nao recebeu urgent: ${pacoca.safety}`);
          assert(limpoDeNovo.safety === "normal", "o produto limpo herdou o urgent do vizinho");

          // 5. A API recusa codigo invalido e codigos iguais.
          const invalida = await clientA.request("/compare", {
            method: "POST",
            body: { products: [{ code: CODIGO_MANUAL_INVALIDO, product: produtos[COD_LEITE] }, { code: COD_LEITE, product: produtos[COD_LEITE] }] },
          });
          assert(invalida.response.status === 400, `codigo invalido na API deu ${invalida.response.status}`);
          const iguais = await clientA.request("/compare", {
            method: "POST",
            body: { products: [{ code: CODIGO_MANUAL_UPCA, product: produtos[CODIGO_MANUAL_CANONICO] }, { code: CODIGO_MANUAL_CANONICO, product: produtos[CODIGO_MANUAL_CANONICO] }] },
          });
          assert(iguais.response.status === 400, `codigos iguais na API deram ${iguais.response.status}`);

          // 6. Explicacao com o modelo trocando a ordem e dizendo "normal".
          const modeloQueTroca = {
            messages: {
              create: async () => ({
                stop_reason: "end_turn",
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      explanations: [
                        { productCode: CODIGO_MANUAL_CANONICO, text: "TEXTO-DO-LIMPO", safety: "normal" },
                        { productCode: COD_LEITE, text: "TEXTO-DO-LEITE", safety: "normal" },
                      ],
                      category: "allergy",
                      usedProductContext: true,
                    }),
                  },
                ],
              }),
            },
          };
          const explicada = await explicarComparacao(
            { user: { id: register.data.user.id } },
            par(COD_LEITE, CODIGO_MANUAL_CANONICO),
            modeloQueTroca,
            { logger: { warn: () => {} } },
          );
          const [leiteExplicado, limpoExplicado] = explicada.comparison.products;
          assert(leiteExplicado.explanation === "TEXTO-DO-LEITE", "a explicacao do leite foi parar em outro produto");
          assert(limpoExplicado.explanation === "TEXTO-DO-LIMPO", "a explicacao do limpo foi parar em outro produto");
          assert(leiteExplicado.safety === "caution", "o modelo dizendo normal derrubou o piso do leite");
          assert(limpoExplicado.safety === "normal", "o produto limpo herdou o piso do leite na explicacao");

          report.productComparison = "PASSED";
          log(
            "OK",
            "product comparison",
            "um veredito por produto, perfil do banco; o limpo nao herda; explicacao amarrada pelo codigo",
          );
        }

        // ------------------------------------------------------------------
        // v0.11.0 - offlineCache: o que o cliente guarda para usar sem rede.
        //
        // O QUE ESTE SUBGATE PROVA: os modulos do CLIENTE (`offlineCache`,
        // `offlineSession`, `offlineLookup`) alimentados pelas respostas do
        // BACKEND REAL - o perfil vem do PostgreSQL, a sessao e um cookie de
        // verdade, o logout e o da API. O que fica guardado contem o produto e o
        // perfil; nao contem veredito, nem o cookie, nem o hash, o salt e o hash
        // de sessao lidos do banco, nem a senha, nem o e-mail; e sai no logout.
        //
        // O QUE ELE NAO PROVA: o IndexedDB do navegador. Aqui o IndexedDB e o do
        // `fake-indexeddb`, uma implementacao completa da API em Node. A
        // persistencia no navegador de verdade e a ligacao com a tela ficam com a
        // verificacao no navegador (AUDIT_REPORT).
        // ------------------------------------------------------------------
        {
          const clientE = new CookieClient("E", baseUrl);
          const registroE = await clientE.request("/auth/register", {
            method: "POST",
            body: { name: `e2e-e-${stamp}`, email: emailE, password, allergies: ["peanut"] },
          });
          assert(registroE.response.status === 201, `register da conta E deve retornar 201 (${registroE.response.status})`);
          const idE = registroE.data.user.id;
          const estrita = await clientE.request("/profile/allergies", {
            method: "PUT",
            body: { allergies: ["peanut"], alertLevels: { peanut: "strict" } },
          });
          assert(estrita.response.status === 200, "a conta E nao gravou o alerta maximo");

          const fabrica = new IDBFactory();
          const cache = criarCacheOffline({ indexedDB: fabrica, alergiasValidas: VALID_ALLERGY_IDS });
          const meDeE = async () => {
            const resposta = await clientE.request("/auth/me");
            if (resposta.response.status !== 200) {
              throw Object.assign(new Error("me recusado"), { status: resposta.response.status });
            }
            return resposta.data;
          };

          // 1. O servidor confirma a sessao: o perfil do PostgreSQL vai para o aparelho.
          const confirmada = await recuperarSessao({ getMe: meDeE, cache });
          assert(confirmada.tipo === "conta" && confirmada.user.id === idE, "a sessao real nao foi confirmada");

          // 2. O produto aberto com internet e as listas reais.
          const COD_OFFLINE = "7896000000019";
          const produtoOffline = {
            code: COD_OFFLINE,
            product_name: "Pacoca E2E offline",
            ingredients_text: "amendoim torrado, acucar",
            nutriments: { "energy-kcal_100g": 520, salt_100g: 0.4 },
          };
          await guardarProdutoVisto(idE, produtoOffline, { cache });
          const vistoE = await clientE.request("/history", {
            method: "POST",
            body: { productCode: COD_OFFLINE, productName: produtoOffline.product_name, productBrand: null, imageUrl: null },
          });
          assert(vistoE.response.status === 201, "a conta E nao gravou historico");
          const historicoE = (await clientE.request("/history")).data.items;
          const favoritosE = (await clientE.request("/favorites")).data.items;
          await cache.guardarColecoes(idE, { historico: historicoE, favoritos: favoritosE });

          // 3. O que ficou guardado, cru: toda loja, toda chave, todo valor.
          const inspecionar = async () => {
            const pedido = (requisicao) =>
              new Promise((resolve, reject) => {
                requisicao.onsuccess = () => resolve(requisicao.result);
                requisicao.onerror = () => reject(requisicao.error);
              });
            const registros = [];
            for (const { name } of await fabrica.databases()) {
              const banco = await pedido(fabrica.open(name));
              for (const loja of banco.objectStoreNames) {
                const transacao = banco.transaction(loja, "readonly");
                const chaves = await pedido(transacao.objectStore(loja).getAllKeys());
                const valores = await pedido(transacao.objectStore(loja).getAll());
                chaves.forEach((chave, i) => registros.push({ loja, chave, valor: valores[i] }));
              }
              banco.close();
            }
            return { registros, texto: JSON.stringify(registros) };
          };
          const chavesFora = (valor, saida = new Set()) => {
            if (Array.isArray(valor)) valor.forEach((item) => chavesFora(item, saida));
            else if (valor && typeof valor === "object") {
              for (const [chave, item] of Object.entries(valor)) {
                saida.add(chave);
                // nome de nutriente nao e campo: "salt_100g" e o sal do rotulo
                if (chave !== "nutriments") chavesFora(item, saida);
              }
            }
            return saida;
          };

          const guardado = await inspecionar();
          assert(guardado.texto.includes("Pacoca E2E offline") && guardado.texto.includes("amendoim torrado"), "o produto nao foi guardado");
          assert(guardado.texto.includes("peanut") && guardado.texto.includes("strict"), "o perfil do PostgreSQL nao foi guardado");
          for (const chave of chavesFora(guardado.registros.map((registro) => registro.valor))) {
            assert(!/verdict|minimumSafety|conflicts|safety|password|hash|salt|token|cookie|api.?key|email/i.test(chave), `campo proibido no cache: ${chave}`);
          }
          const segredosE = await db.query(
            `SELECT u.password_hash, u.password_salt, s.token_hash
               FROM users u LEFT JOIN sessions s ON s.user_id = u.id
              WHERE u.email = $1`,
            [emailE],
          );
          assert(segredosE.rowCount > 0, "nao foi possivel ler o material de senha de E para conferir");
          const sensiveisE = [
            ...new Set(segredosE.rows.flatMap((linha) => [linha.password_hash, linha.password_salt, linha.token_hash])),
            ...clientE.cookies.values(),
            password,
            emailE,
          ].filter(Boolean);
          for (const valor of sensiveisE) {
            assert(!guardado.texto.includes(valor), "o cache guardou senha, hash, sessao, cookie ou e-mail");
          }

          // 4. Sem rede: o perfil do aparelho e o veredito refeito agora.
          const semRede = async () => {
            throw Object.assign(new Error("sem rede"), { status: 0 });
          };
          const doAparelho = await recuperarSessao({ getMe: semRede, cache });
          assert(doAparelho.tipo === "aparelho" && doAparelho.perfil.id === idE, "sem rede, o perfil do aparelho nao veio");
          const lido = await consultarNoAparelho(COD_OFFLINE, { dono: idE, cache });
          assert(lido.estado === NO_APARELHO, `o produto guardado nao foi lido sem rede (${lido.estado})`);
          const perfilDe = (perfil) => ({ profileAllergies: perfil.alergias, alertLevels: perfil.niveis });
          assert(avaliarNoAparelho(lido.produto, perfilDe(doAparelho.perfil)).safety === "urgent", "sem rede, o alerta maximo nao deu urgent");

          // 5. O perfil muda COM rede, pela API real: a leitura sem rede segue o novo.
          const padrao = await clientE.request("/profile/allergies", {
            method: "PUT",
            body: { allergies: ["peanut"], alertLevels: {} },
          });
          assert(padrao.response.status === 200, "a conta E nao voltou ao alerta padrao");
          await aoConfirmarConta(padrao.data.user, { cache });
          const depoisDaMudanca = await recuperarSessao({ getMe: semRede, cache });
          const relido = await consultarNoAparelho(COD_OFFLINE, { dono: idE, cache });
          const refeito = avaliarNoAparelho(relido.produto, perfilDe(depoisDaMudanca.perfil));
          assert(refeito.safety === "caution", `a leitura sem rede usou o perfil do momento do cache (${refeito.safety})`);

          // 6. Logout REAL: o cache da conta sai do aparelho.
          const saida = await aoSairDaConta({
            sair: async () => {
              const resposta = await clientE.request("/auth/logout", { method: "POST" });
              if (resposta.response.status !== 200) throw new Error(`logout ${resposta.response.status}`);
            },
            cache,
          });
          assert(saida.servidorRespondeu, "o logout real nao respondeu");
          assert((await clientE.request("/auth/me")).response.status === 401, "a sessao de E sobreviveu ao logout");
          const depoisDoLogout = await inspecionar();
          for (const vestigio of ["peanut", idE, COD_OFFLINE, "Pacoca E2E offline", `e2e-e-${stamp}`]) {
            assert(!depoisDoLogout.texto.includes(vestigio), `o logout deixou vestigio no cache: ${vestigio}`);
          }

          report.offlineCache = "PASSED";
          log(
            "OK",
            "offline cache",
            "perfil do banco e produto guardados, sem veredito nem credencial; perfil novo refeito sem rede; logout real limpa",
          );
        }

        // ------------------------------------------------------------------
        // v0.8.0 - direitos do titular: exportar e excluir.
        //
        // Dois subgates, e nao um: exportar e excluir sao promessas
        // diferentes, e o auditor precisa saber qual das duas quebrou.
        // ------------------------------------------------------------------

        // accountExport: A exporta. Vem tudo de A; nada do vizinho (a conta
        // de isolamento, que ganha historico proprio aqui) e nada de senha,
        // sessao ou credencial - conferido pelo VALOR lido no banco.
        const produtoVizinho = {
          productCode: `e2e-viz-${stamp}`,
          productName: "Produto do vizinho E2E",
          productBrand: null,
          imageUrl: null,
        };
        const gravouVizinho = await clientIso.request("/history", { method: "POST", body: produtoVizinho });
        assert(gravouVizinho.response.status === 201, "o vizinho nao conseguiu gravar historico");

        const exportacao = await clientA.request("/account/export");
        assert(exportacao.response.status === 200, `exportacao deve retornar 200 (${exportacao.response.status})`);
        const dados = exportacao.data;
        const textoExportado = JSON.stringify(dados);
        assert(dados.formato === "nutriscan-dados-do-titular" && dados.versaoDoFormato === 1, "formato da exportacao");
        assert(dados.conta?.email === emailA, "a exportacao nao e da conta A");
        assert(Array.isArray(dados.alergias) && dados.alergias.length > 0, "as alergias de A nao vieram");
        assert(
          (dados.historico || []).some((item) => item.codigo === produtoTeste.productCode),
          "o historico de A nao veio",
        );
        assert(Array.isArray(dados.favoritos), "a exportacao nao traz a lista de favoritos");

        for (const valor of [emailB, produtoVizinho.productCode, produtoVizinho.productName]) {
          assert(!textoExportado.includes(valor), "a exportacao de A carrega dado do vizinho");
        }

        const segredosA = await db.query(
          `SELECT u.password_hash, u.password_salt, s.token_hash
             FROM users u LEFT JOIN sessions s ON s.user_id = u.id
            WHERE u.email = $1`,
          [emailA],
        );
        assert(segredosA.rowCount > 0, "nao foi possivel ler o material de senha de A para conferir");
        const valoresSensiveis = [
          ...new Set(segredosA.rows.flatMap((linha) => [linha.password_hash, linha.password_salt, linha.token_hash])),
          ...clientA.cookies.values(),
        ].filter(Boolean);
        for (const valor of valoresSensiveis) {
          assert(!textoExportado.includes(valor), "a exportacao carrega senha, hash ou sessao");
        }
        assert(!/"(password|password_hash|password_salt|token|token_hash|cookie)"/i.test(textoExportado), "campo sensivel na exportacao");

        assert(exportacao.response.headers.get("cache-control") === "no-store", "a exportacao pode ir para cache");
        const disposicao = exportacao.response.headers.get("content-disposition") || "";
        assert(/filename="nutriscan-meus-dados-\d{4}-\d{2}-\d{2}\.json"/.test(disposicao), "nome de arquivo fora do formato");
        assert(!disposicao.includes(emailA.split("@")[0]), "o nome do arquivo carrega o e-mail");
        report.accountExport = "PASSED";
        log("OK", "account export", "tudo de A, nada do vizinho, nada de senha nem de sessao");

        // accountDeletion: a conta D, com dados e dois aparelhos, e apagada.
        // Senha errada nao apaga nada; senha certa apaga tudo; as duas sessoes
        // caem; nenhuma tabela que referencia `users` guarda linha de D; e A,
        // a vizinha, segue intacta.
        const clientD = new CookieClient("D", baseUrl);
        const clientD2 = new CookieClient("D2", baseUrl);
        const registerD = await clientD.request("/auth/register", {
          method: "POST",
          body: { name: `e2e-d-${stamp}`, email: emailD, password, allergies: ["milk"] },
        });
        assert(registerD.response.status === 201, "register da conta D deve retornar 201");
        const idD = registerD.data.user.id;

        const produtoD = { ...produtoTeste, productCode: `e2e-d-${stamp}` };
        assert((await clientD.request("/history", { method: "POST", body: produtoD })).response.status === 201, "D nao gravou historico");
        assert((await clientD.request("/favorites", { method: "POST", body: produtoD })).response.status === 201, "D nao favoritou");
        const loginD2 = await clientD2.request("/auth/login", { method: "POST", body: { identifier: emailD, password } });
        assert(loginD2.response.status === 200, "o segundo aparelho de D nao entrou");

        const historicoAAntes = (await clientA.request("/history")).data.items?.length ?? -1;

        const errada = await clientD.request("/account", { method: "DELETE", body: { password: `${password}-errada` } });
        assert(errada.response.status === 403, `exclusao com senha errada deve ser recusada (${errada.response.status})`);
        const dSobreviveu = await db.query("SELECT 1 FROM users WHERE id = $1", [idD]);
        assert(dSobreviveu.rowCount === 1, "a senha errada apagou a conta");

        const cookiesAntigosD = new Map(clientD.cookies);
        const excluida = await clientD.request("/account", { method: "DELETE", body: { password } });
        assert(excluida.response.status === 200, `exclusao com a senha certa deve retornar 200 (${excluida.response.status})`);

        const clientDVelho = new CookieClient("D-velho", baseUrl);
        for (const [chave, valor] of cookiesAntigosD) clientDVelho.cookies.set(chave, valor);
        for (const [aparelho, cliente] of [["cookie antigo de D", clientDVelho], ["segundo aparelho de D", clientD2]]) {
          const me = await cliente.request("/auth/me");
          assert(me.response.status === 401, `${aparelho} ainda autentica depois da exclusao (${me.response.status})`);
        }

        const chavesParaUsers = await db.query(
          `SELECT con.conrelid::regclass::text AS tabela, a.attname AS coluna
             FROM pg_constraint con
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
            WHERE con.contype = 'f' AND con.confrelid = 'users'::regclass`,
        );
        assert(chavesParaUsers.rowCount >= 4, "o catalogo nao listou as tabelas que referenciam users");
        for (const { tabela, coluna } of chavesParaUsers.rows) {
          const sobra = await db.query(`SELECT count(*)::int AS n FROM ${tabela} WHERE "${coluna}" = $1`, [idD]);
          assert(sobra.rows[0].n === 0, `sobrou linha de D em ${tabela}`);
        }
        const dAindaExiste = await db.query("SELECT 1 FROM users WHERE id = $1", [idD]);
        assert(dAindaExiste.rowCount === 0, "a conta D continua em users");

        assert((await clientA.request("/auth/me")).response.status === 200, "a exclusao de D derrubou a sessao de A");
        const historicoADepois = (await clientA.request("/history")).data.items?.length ?? -2;
        assert(historicoADepois === historicoAAntes, "a exclusao de D mexeu no historico de A");
        report.accountDeletion = "PASSED";
        log("OK", "account deletion", "senha errada nao apaga; senha certa apaga tudo; sessoes caem; vizinha intacta");

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
        await cleanupUsers(db, [emailA, emailB, emailD, emailE]).catch((error) => {
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

    // Fail-closed: encostar na margem de um limitador reprova a execucao. Uma
    // suite que so quebra quando ja passou do teto descobre o problema tarde
    // demais, com a saida ilegivel.
    const orcamento = orcamentoDeLimite();
    if (orcamento.estouraram.length) {
      const detalhe = orcamento.baldes
        .filter((linha) => !linha.dentroDaMargem)
        .map((linha) => `${linha.balde} usou ${linha.usado} de ${linha.teto} (margem ${linha.margemMaxima})`)
        .join(" | ");
      throw new Error(`orcamento de limite estourado: ${detalhe}`);
    }

    report.anthropicCalls = anthropicCalls;
    report.ok = true;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.anthropicCalls = anthropicCalls;
    report.rateLimitBudget = orcamentoDeLimite();

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
