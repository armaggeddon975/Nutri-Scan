import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";

import pg from "pg";

import { answerAssistantChat, resetMinimizationAttempts } from "../src/ai/assistantService.js";
import { buildAssistantContext } from "../src/ai/contextBuilder.js";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { closePool, query } from "../src/database/pool.js";
import { createSession } from "../src/repositories/sessionRepository.js";
import { createUser, replaceUserAllergies } from "../src/repositories/userRepository.js";
import { normalizeNameKey } from "../src/utils/normalize.js";
import { hashPassword } from "../src/utils/password.js";
import {
  generateId,
  generateSessionToken,
  getSessionExpiration,
  hashSessionToken,
} from "../src/utils/sessionToken.js";
import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// v0.9.0 - nivel de alerta por alergia, contra PostgreSQL REAL.
//
// Escreve no banco apontado por DATABASE_URL, com a mesma autorizacao explicita
// das outras suites de integracao. Sem ela, cada teste sai como NAO EXECUTADO -
// e SKIP nao e PASS.
const autorizado = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const temBanco = Boolean(env.databaseUrl) && autorizado;
const pular = temBanco
  ? false
  : env.databaseUrl
    ? "NAO EXECUTADO - defina RUN_DB_INTEGRATION_TESTS=true para escrever no banco apontado por DATABASE_URL"
    : "NAO EXECUTADO - PostgreSQL nao disponivel";

const PREFIXO = "nivel-test-";
const SENHA = "senha-do-titular-123";

const PRODUTO_DECLARADO = { name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };
const PRODUTO_TRACO = {
  name: "Biscoito de arroz",
  ingredients_text: "farinha de arroz, oleo vegetal, sal",
  traces: ["peanuts"],
};

after(async () => {
  if (temBanco) await query(`DELETE FROM users WHERE email LIKE '${PREFIXO}%@example.com'`);
  await closePool();
});

// ---------------------------------------------------------------------------
// Montagem - contas criadas direto no banco, como na suite da conta, para nao
// gastar o limitador de autenticacao com preparo.
// ---------------------------------------------------------------------------

async function novaSessao(userId) {
  const token = generateSessionToken();
  await createSession(
    { id: generateId(), userId, tokenHash: hashSessionToken(token), expiresAt: getSessionExpiration(env.sessionTtlDays) },
    { query },
  );
  return { token, cookie: `${env.sessionCookieName}=${token}` };
}

async function criarConta(niveis = {}) {
  const id = generateId();
  const nome = `nivel ${randomUUID().slice(0, 8)}`;
  const email = `${PREFIXO}${randomUUID()}@example.com`;
  const senha = await hashPassword(SENHA);
  await createUser(
    { id, name: nome, nameKey: normalizeNameKey(nome), email, passwordHash: senha.hash, passwordSalt: senha.salt },
    { query },
  );
  const alergias = Object.keys(niveis);
  if (alergias.length) await replaceUserAllergies(id, alergias, { query }, niveis);
  return { id, nome, email, ...(await novaSessao(id)) };
}

async function niveisNoBanco(userId) {
  const { rows } = await query(
    "SELECT allergy_id, alert_level FROM user_allergies WHERE user_id = $1 ORDER BY allergy_id",
    [userId],
  );
  return Object.fromEntries(rows.map((r) => [r.allergy_id, r.alert_level]));
}

async function comServidor(callback) {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function pedir(base, caminho, { method = "GET", cookie, body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const texto = await resposta.text();
  let corpo = {};
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    corpo = { texto };
  }
  return { status: resposta.status, texto, corpo };
}

// Schema temporario montado SO pelos arquivos de `migrations/`, em ordem - o
// que um banco novo recebe. Mudar uma migration nao muda o banco de teste ja
// migrado; aqui muda. `ate` limita ate qual arquivo (exclusive) rodar.
async function comSchemaDasMigrations(callback, { ate } = {}) {
  const schema = `nutriscan_nivel_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const cliente = new pg.Client({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await cliente.connect();
  try {
    await cliente.query(`CREATE SCHEMA ${schema}`);
    await cliente.query(`SET search_path TO ${schema}, public`);
    const pasta = path.join(backendRoot, "migrations");
    const aplicar = async (arquivo) => {
      if (arquivo.endsWith(".sql")) {
        await cliente.query(await readFile(path.join(pasta, arquivo), "utf8"));
      } else {
        const { up } = await import(pathToFileURL(path.join(pasta, arquivo)).href);
        await up(cliente);
      }
    };
    const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".sql") || f.endsWith(".js")).sort();
    for (const arquivo of arquivos) {
      if (ate && arquivo >= ate) break;
      await aplicar(arquivo);
    }
    return await callback({ cliente, schema, aplicar });
  } finally {
    await cliente.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await cliente.end();
  }
}

// ---------------------------------------------------------------------------
// S8 a S10 - a rota que grava o perfil
// ---------------------------------------------------------------------------

test("S8 a API recusa nivel desconhecido, e nada muda no banco", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "strict" });
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/profile/allergies", {
      method: "PUT",
      cookie: conta.cookie,
      body: { allergies: ["milk"], alertLevels: { milk: "grave" } },
    });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.error?.code, "VALIDATION_ERROR");
  });
  assert.deepEqual(await niveisNoBanco(conta.id), { milk: "strict" });
});

test("S9 a API recusa nivel para alergia ausente do perfil, e nada muda", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "standard" });
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/profile/allergies", {
      method: "PUT",
      cookie: conta.cookie,
      body: { allergies: ["milk"], alertLevels: { peanut: "strict" } },
    });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.error?.code, "VALIDATION_ERROR");
    assert.ok(r.corpo.error.details.includes("Nível de alerta para alergia que não está no perfil."));
  });
  assert.deepEqual(await niveisNoBanco(conta.id), { milk: "standard" });
});

test("S10 corpo sem nivel continua funcionando e grava padrao", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "strict" });
  await comServidor(async (base) => {
    const comNivel = await pedir(base, "/api/profile/allergies", {
      method: "PUT",
      cookie: conta.cookie,
      body: { allergies: ["milk", "peanut"], alertLevels: { peanut: "strict" } },
    });
    assert.equal(comNivel.status, 200);
    assert.deepEqual(comNivel.corpo.user.alertLevels, { milk: "standard", peanut: "strict" });
    for (const rota of ["/api/profile", "/api/auth/me"]) {
      const leitura = await pedir(base, rota, { cookie: conta.cookie });
      assert.deepEqual(leitura.corpo.user.alertLevels, { milk: "standard", peanut: "strict" }, rota);
    }

    // O contrato de antes da v0.9.0: so `allergies`. Vale, e significa padrao.
    const semNivel = await pedir(base, "/api/profile/allergies", {
      method: "PUT",
      cookie: conta.cookie,
      body: { allergies: ["milk", "peanut"] },
    });
    assert.equal(semNivel.status, 200);
    assert.deepEqual(semNivel.corpo.user.allergies, ["milk", "peanut"]);
    assert.deepEqual(semNivel.corpo.user.alertLevels, { milk: "standard", peanut: "standard" });
  });
  assert.deepEqual(await niveisNoBanco(conta.id), { milk: "standard", peanut: "standard" });
});

// ---------------------------------------------------------------------------
// S11 e S12 - migration e restricao no banco
// ---------------------------------------------------------------------------

test("S11 migration 004: alergias existentes recebem padrao, e rodar de novo nao muda nada", { skip: pular }, async () => {
  await comSchemaDasMigrations(
    async ({ cliente, aplicar }) => {
      // Um perfil cadastrado ANTES da 004, sem a coluna.
      const id = generateId();
      await cliente.query(
        "INSERT INTO users (id, name, name_key, email, password_hash, password_salt) VALUES ($1, 'antigo', $2, $3, 'h', 's')",
        [id, `antigo-${id}`, `${id}@antes.example`],
      );
      await cliente.query("INSERT INTO user_allergies (user_id, allergy_id) VALUES ($1, 'milk'), ($1, 'peanut')", [id]);

      await aplicar("004_nivel_de_alerta.sql");
      const depois = await cliente.query("SELECT allergy_id, alert_level FROM user_allergies ORDER BY allergy_id");
      assert.deepEqual(depois.rows, [
        { allergy_id: "milk", alert_level: "standard" },
        { allergy_id: "peanut", alert_level: "standard" },
      ]);

      // Idempotente: de novo, sem erro e sem mudar dado, coluna ou restricao.
      await cliente.query("UPDATE user_allergies SET alert_level = 'strict' WHERE allergy_id = 'peanut'");
      await aplicar("004_nivel_de_alerta.sql");
      await aplicar("004_nivel_de_alerta.sql");
      const deNovo = await cliente.query("SELECT allergy_id, alert_level FROM user_allergies ORDER BY allergy_id");
      assert.deepEqual(deNovo.rows, [
        { allergy_id: "milk", alert_level: "standard" },
        { allergy_id: "peanut", alert_level: "strict" },
      ], "rodar a 004 de novo mexeu no dado");
      const restricoes = await cliente.query(
        "SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'user_allergies'::regclass AND conname = 'user_allergies_alert_level_check'",
      );
      assert.equal(restricoes.rows[0].n, 1);
    },
    { ate: "004" },
  );
});

async function tentarNivelInvalido(cliente, rotulo) {
  const id = generateId();
  await cliente.query(
    "INSERT INTO users (id, name, name_key, email, password_hash, password_salt) VALUES ($1, 'x', $2, $3, 'h', 's')",
    [id, `chk-${id}`, `${PREFIXO}${id}@example.com`],
  );
  try {
    for (const sql of [
      ["INSERT INTO user_allergies (user_id, allergy_id, alert_level) VALUES ($1, 'milk', 'grave')", [id]],
      ["INSERT INTO user_allergies (user_id, allergy_id, alert_level) VALUES ($1, 'milk', 'STRICT')", [id]],
    ]) {
      await assert.rejects(cliente.query(...sql), (erro) => erro.code === "23514", `${rotulo}: o banco aceitou ${sql[0]}`);
    }
    await cliente.query("INSERT INTO user_allergies (user_id, allergy_id, alert_level) VALUES ($1, 'milk', 'strict')", [id]);
    await assert.rejects(
      cliente.query("UPDATE user_allergies SET alert_level = 'urgent' WHERE user_id = $1", [id]),
      (erro) => erro.code === "23514",
      `${rotulo}: o banco aceitou UPDATE para nivel invalido`,
    );
  } finally {
    await cliente.query("DELETE FROM users WHERE id = $1", [id]);
  }
}

test("S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations", { skip: pular }, async () => {
  await tentarNivelInvalido({ query }, "banco em uso");
  await comSchemaDasMigrations(({ cliente }) => tentarNivelInvalido(cliente, "schema das migrations"));
});

// ---------------------------------------------------------------------------
// S13 - nivel nunca congelado em historico ou favorito
// ---------------------------------------------------------------------------

function vereditoCom(perfil, niveis, produto) {
  const snap = buildAssistantContext({ product: produto, allergies: perfil }).allergySnapshot;
  return buildAllergyVerdict({
    profileRisks: snap.profileRisks,
    profileAllergies: snap.profileAllergies,
    hasProductContext: snap.hasProductContext,
    alertLevels: niveis,
  });
}

test("S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo", { skip: pular }, async () => {
  const conta = await criarConta({ peanut: "standard" });
  const item = { productCode: `nivel-${randomUUID().slice(0, 8)}`, productName: "Pacoca", productBrand: null, imageUrl: null };

  await comServidor(async (base) => {
    assert.equal((await pedir(base, "/api/history", { method: "POST", cookie: conta.cookie, body: item })).status, 201);
    assert.equal((await pedir(base, "/api/favorites", { method: "POST", cookie: conta.cookie, body: item })).status, 201);

    const ler = async () => {
      const historico = (await pedir(base, "/api/history", { cookie: conta.cookie })).corpo.items.find((i) => i.productCode === item.productCode);
      const favorito = (await pedir(base, "/api/favorites", { cookie: conta.cookie })).corpo.items.find((i) => i.productCode === item.productCode);
      const perfil = (await pedir(base, "/api/profile", { cookie: conta.cookie })).corpo.user;
      return { historico, favorito, perfil };
    };
    const definir = (nivel) =>
      pedir(base, "/api/profile/allergies", {
        method: "PUT",
        cookie: conta.cookie,
        body: { allergies: ["peanut"], alertLevels: { peanut: nivel } },
      });

    const antes = await ler();
    assert.equal(vereditoCom(antes.perfil.allergies, antes.perfil.alertLevels, PRODUTO_DECLARADO).minimumSafety, "caution");

    assert.equal((await definir("strict")).status, 200);
    const depois = await ler();
    // O registro e o mesmo, byte a byte: nada nele dependia do nivel.
    assert.deepEqual(depois.historico, antes.historico);
    assert.deepEqual(depois.favorito, antes.favorito);
    for (const registro of [depois.historico, depois.favorito]) {
      for (const campo of ["alertLevel", "alertLevels", "alert_level", "severity", "verdict", "allergyVerdict", "safety"]) {
        assert.equal(campo in registro, false, `o item carrega ${campo}`);
      }
    }
    // A leitura seguinte usa o nivel novo.
    assert.equal(vereditoCom(depois.perfil.allergies, depois.perfil.alertLevels, PRODUTO_DECLARADO).minimumSafety, "urgent");

    assert.equal((await definir("standard")).status, 200);
    const deVolta = await ler();
    assert.equal(vereditoCom(deVolta.perfil.allergies, deVolta.perfil.alertLevels, PRODUTO_DECLARADO).minimumSafety, "caution");
  });
});

const COLUNA_DE_ESTADO = /alert|level|severity|verdict|safety|risk/i;

test("S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations", { skip: pular }, async () => {
  const conferir = async (cliente, schema, rotulo) => {
    const { rows } = await cliente.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name IN ('product_history', 'product_favorites')`,
      [schema],
    );
    assert.ok(rows.length >= 12, `${rotulo}: nao encontrei as colunas das colecoes`);
    const suspeitas = rows.filter((r) => COLUNA_DE_ESTADO.test(r.column_name));
    assert.deepEqual(suspeitas, [], `${rotulo}: coleção com coluna de estado de alergia`);
  };
  await conferir({ query }, "public", "banco em uso");
  await comSchemaDasMigrations(({ cliente, schema }) => conferir(cliente, schema, "schema das migrations"));
});

// ---------------------------------------------------------------------------
// S14 e S15 - exportacao e exclusao da v0.8.0
// ---------------------------------------------------------------------------

test("S14 o nivel de alerta entra na exportacao da conta", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "strict", peanut: "standard" });
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account/export", { cookie: conta.cookie });
    assert.equal(r.status, 200);
    const porId = Object.fromEntries(r.corpo.alergias.map((a) => [a.id, a]));
    assert.equal(porId.milk.alertaMaximo, true);
    assert.equal(porId.peanut.alertaMaximo, false);
    assert.equal(r.corpo.versaoDoFormato, 1, "campo acrescentado nao muda a versao do formato");
  });
});

test("S15 o nivel sai na exclusao da conta - varredura das tabelas", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "strict", peanut: "strict" });
  assert.equal(Object.keys(await niveisNoBanco(conta.id)).length, 2);
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: SENHA } });
    assert.equal(r.status, 200);
  });
  // Toda tabela com chave para `users`, pelo catalogo - e `user_allergies`, que
  // guarda o nivel, nominalmente.
  const { rows: chaves } = await query(
    `SELECT con.conrelid::regclass::text AS tabela, a.attname AS coluna
       FROM pg_constraint con
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.contype = 'f' AND con.confrelid = 'users'::regclass`,
  );
  assert.ok(chaves.some((c) => c.tabela === "user_allergies"));
  for (const { tabela, coluna } of chaves) {
    const { rows } = await query(`SELECT count(*)::int AS n FROM ${tabela} WHERE "${coluna}" = $1`, [conta.id]);
    assert.equal(rows[0].n, 0, `sobrou linha em ${tabela}`);
  }
  const niveis = await query("SELECT count(*)::int AS n FROM user_allergies WHERE user_id = $1", [conta.id]);
  assert.equal(niveis.rows[0].n, 0);
});

// ---------------------------------------------------------------------------
// S16 - isolamento
// ---------------------------------------------------------------------------

test("S16 o nivel de A nao e visivel nem alteravel por B", { skip: pular }, async () => {
  const a = await criarConta({ milk: "strict" });
  const b = await criarConta({ milk: "standard" });
  await comServidor(async (base) => {
    const perfilB = await pedir(base, "/api/profile", { cookie: b.cookie });
    assert.deepEqual(perfilB.corpo.user.alertLevels, { milk: "standard" });
    assert.equal(perfilB.texto.includes(a.id), false);

    // B tenta escrever no perfil de A pelo corpo: a identidade vem da sessao.
    for (const corpo of [
      { allergies: ["milk"], alertLevels: { milk: "strict" }, userId: a.id, user_id: a.id },
      { allergies: [], userId: a.id, user_id: a.id },
    ]) {
      const r = await pedir(base, "/api/profile/allergies", { method: "PUT", cookie: b.cookie, body: corpo });
      assert.equal(r.status, 200);
      assert.equal(r.corpo.user.id, b.id);
    }

    const exportacaoB = await pedir(base, "/api/account/export", { cookie: b.cookie });
    assert.equal(exportacaoB.corpo.conta.email, b.email);
    assert.equal(exportacaoB.texto.includes(a.email), false);
  });
  assert.deepEqual(await niveisNoBanco(a.id), { milk: "strict" }, "B alterou o nivel de A");
  assert.deepEqual(await niveisNoBanco(b.id), {});
});

// ---------------------------------------------------------------------------
// S17 - nivel fora do log, nos fluxos reais
// ---------------------------------------------------------------------------

// Modelo que nega o conflito, para provocar o registro de minimizacao.
function modeloQueNega() {
  return {
    messages: {
      create: async () => ({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({ answer: "Pode consumir.", category: "allergy", safety: "normal", usedProductContext: true }),
          },
        ],
      }),
    },
  };
}

test("S17 o nivel nunca aparece no log - API real e assistente com o perfil do banco", { skip: pular }, async () => {
  const conta = await criarConta({ peanut: "standard" });
  const capturado = [];
  const metodos = ["log", "info", "warn", "error", "debug"];
  const originais = Object.fromEntries(metodos.map((m) => [m, console[m]]));
  for (const m of metodos) console[m] = (...args) => capturado.push(args.map(String).join(" "));

  try {
    await comServidor(async (base) => {
      await pedir(base, "/api/profile/allergies", {
        method: "PUT",
        cookie: conta.cookie,
        body: { allergies: ["peanut"], alertLevels: { peanut: "strict" } },
      });
      await pedir(base, "/api/profile/allergies", {
        method: "PUT",
        cookie: conta.cookie,
        body: { allergies: ["peanut"], alertLevels: { peanut: "grave" } },
      });
      await pedir(base, "/api/profile", { cookie: conta.cookie });
      await pedir(base, "/api/auth/me", { cookie: conta.cookie });
      await pedir(base, "/api/account/export", { cookie: conta.cookie });
    });
    // O assistente lendo o nivel do PostgreSQL, com o modelo negando o conflito
    // - o caminho que gera o registro de minimizacao.
    resetMinimizationAttempts();
    for (const produto of [PRODUTO_DECLARADO, PRODUTO_TRACO]) {
      await answerAssistantChat(
        { user: { id: conta.id } },
        { message: "Posso consumir esse produto?", conversation: [], product: produto, guestAllergies: [] },
        modeloQueNega(),
      );
    }
    resetMinimizationAttempts();
  } finally {
    for (const m of metodos) console[m] = originais[m];
  }

  const log = capturado.join("\n");
  assert.ok(log.includes("assistant.allergy_minimization_attempt"), "o fluxo nao gerou o registro que deveria conferir");
  for (const proibido of ["strict", "grave", "alertLevel", "alert_level", "alertaMaximo", "urgent"]) {
    assert.equal(log.includes(proibido), false, `o log carrega "${proibido}"`);
  }
});

// ---------------------------------------------------------------------------
// S5 contra o banco - o piso sai do nivel gravado no PostgreSQL
// ---------------------------------------------------------------------------

test("S5 com o perfil do banco, o modelo negando nao derruba o piso do alerta maximo", { skip: pular }, async () => {
  const conta = await criarConta({ peanut: "strict" });
  const declarado = await answerAssistantChat(
    { user: { id: conta.id } },
    { message: "Posso consumir esse produto?", conversation: [], product: PRODUTO_DECLARADO, guestAllergies: [] },
    modeloQueNega(),
    { logger: { warn: () => {} } },
  );
  assert.equal(declarado.safety, "urgent");
  assert.equal(declarado.allergyVerdict.profileSource, "postgresql");

  const traco = await answerAssistantChat(
    { user: { id: conta.id } },
    { message: "Posso consumir esse produto?", conversation: [], product: PRODUTO_TRACO, guestAllergies: ["milk"] },
    modeloQueNega(),
    { logger: { warn: () => {} } },
  );
  assert.equal(traco.safety, "caution");
  assert.equal(traco.allergyVerdict.conflicts[0].origin, "traces");
});
