import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test, { after } from "node:test";

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
import { analyzeComparedProduct } from "../../shared/productComparison.js";

// v0.10.0 - comparacao de dois produtos contra PostgreSQL REAL. Mesma
// autorizacao explicita das outras suites: sem ela, NAO EXECUTADO - e SKIP nao
// e PASS.
const autorizado = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const temBanco = Boolean(env.databaseUrl) && autorizado;
const pular = temBanco
  ? false
  : env.databaseUrl
    ? "NAO EXECUTADO - defina RUN_DB_INTEGRATION_TESTS=true para escrever no banco apontado por DATABASE_URL"
    : "NAO EXECUTADO - PostgreSQL nao disponivel";

const PREFIXO = "comparacao-test-";

const COD_LEITE = "7891000100103";
const COD_ARROZ = "0036000291452";
const COD_PACOCA = "5449000000996";
const LEITE = { product_name: "Leite em po", ingredients_text: "leite em po integral" };
const ARROZ = { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" };
const PACOCA = { product_name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };

after(async () => {
  if (temBanco) await query(`DELETE FROM users WHERE email LIKE '${PREFIXO}%@example.com'`);
  await closePool();
});

async function criarConta(niveis = {}) {
  const id = generateId();
  const nome = `comparacao ${randomUUID().slice(0, 8)}`;
  const email = `${PREFIXO}${randomUUID()}@example.com`;
  const senha = await hashPassword("senha-de-teste-123");
  await createUser(
    { id, name: nome, nameKey: normalizeNameKey(nome), email, passwordHash: senha.hash, passwordSalt: senha.salt },
    { query },
  );
  const alergias = Object.keys(niveis);
  if (alergias.length) await replaceUserAllergies(id, alergias, { query }, niveis);
  const token = generateSessionToken();
  await createSession(
    { id: generateId(), userId: id, tokenHash: hashSessionToken(token), expiresAt: getSessionExpiration(env.sessionTtlDays) },
    { query },
  );
  return { id, email, cookie: `${env.sessionCookieName}=${token}` };
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

async function comparar(base, corpo, cookie) {
  const resposta = await fetch(`${base}/api/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, json: await resposta.json() };
}

async function contagens() {
  const tabelas = ["users", "sessions", "user_allergies", "product_history", "product_favorites"];
  const saida = {};
  for (const tabela of tabelas) saida[tabela] = (await query(`SELECT count(*)::int AS n FROM ${tabela}`)).rows[0].n;
  return saida;
}

test("C1t e C2t com o perfil do PostgreSQL: um veredito por produto, o limpo nao herda", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "standard" });
  await comServidor(async (base) => {
    const { status, json } = await comparar(
      base,
      { products: [{ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }] },
      conta.cookie,
    );
    assert.equal(status, 200);
    assert.equal(json.comparison.profileSource, "postgresql");
    const [leite, arroz] = json.comparison.products;
    const perfil = { profileAllergies: ["milk"], profileSource: "postgresql" };
    // O veredito de cada um e o do produto calculado sozinho, com o perfil do banco.
    const { safetyFloorApplied: _a, ...vereditoLeite } = leite.allergyVerdict;
    const { safetyFloorApplied: _b, ...vereditoArroz } = arroz.allergyVerdict;
    assert.deepEqual(vereditoLeite, analyzeComparedProduct(LEITE, perfil).allergyVerdict);
    assert.deepEqual(vereditoArroz, analyzeComparedProduct(ARROZ, perfil).allergyVerdict);
    assert.equal(leite.safety, "caution");
    assert.equal(arroz.safety, "normal");
  });
});

test("C3t com o nivel do PostgreSQL: urgent so no produto declarado de alergia em alerta maximo", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "standard", peanut: "strict" });
  await comServidor(async (base) => {
    const { json } = await comparar(
      base,
      { products: [{ code: COD_LEITE, product: LEITE }, { code: COD_PACOCA, product: PACOCA }] },
      conta.cookie,
    );
    const [leite, pacoca] = json.comparison.products;
    assert.equal(leite.safety, "caution");
    assert.equal(pacoca.safety, "urgent");
    assert.equal(pacoca.allergyVerdict.conflicts[0].alertLevel, "strict");
  });
});

test("C13 a sessao de B com o id de A no corpo compara com o perfil de B", { skip: pular }, async () => {
  const a = await criarConta({ milk: "standard" });
  const b = await criarConta({ peanut: "standard" });
  await comServidor(async (base) => {
    const { json } = await comparar(
      base,
      {
        products: [{ code: COD_LEITE, product: LEITE }, { code: COD_PACOCA, product: PACOCA }],
        userId: a.id,
        user_id: a.id,
        user: { id: a.id },
        guestAllergies: ["milk"],
      },
      b.cookie,
    );
    const [leite, pacoca] = json.comparison.products;
    assert.equal(leite.allergyVerdict.status, "clear", "o leite deu conflito: o perfil de A foi usado");
    assert.equal(pacoca.allergyVerdict.status, "conflict");
  });
});

test("C14 comparar nao grava nada - nem visitante, nem com sessao", { skip: pular }, async () => {
  const conta = await criarConta({ milk: "standard" });
  const antes = await contagens();
  await comServidor(async (base) => {
    const corpo = { products: [{ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }], guestAllergies: ["milk"] };
    const visitante = await comparar(base, corpo);
    assert.equal(visitante.status, 200);
    assert.equal(visitante.json.comparison.profileSource, "request");
    const autenticado = await comparar(base, corpo, conta.cookie);
    assert.equal(autenticado.status, 200);
  });
  assert.deepEqual(await contagens(), antes, "a comparacao gravou alguma linha");
});
