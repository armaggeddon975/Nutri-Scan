import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createServer, request as requisicaoHttp } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { after } from "node:test";

import pg from "pg";

import { VALID_ALLERGY_IDS } from "../src/config/allergies.js";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { closePool, query } from "../src/database/pool.js";
import { TETO_EXPORTACAO_POR_IP, TETO_EXPORTACAO_POR_USUARIO } from "../src/middleware/rateLimit.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// v0.8.0 - direitos do titular, contra PostgreSQL REAL.
//
// Estes testes escrevem no banco apontado por DATABASE_URL e exigem a mesma
// autorizacao explicita das outras suites de integracao: a presenca da string
// nao basta.
const autorizado = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const temBanco = Boolean(env.databaseUrl) && autorizado;
const pular = temBanco
  ? false
  : env.databaseUrl
    ? "NAO EXECUTADO - defina RUN_DB_INTEGRATION_TESTS=true para escrever no banco apontado por DATABASE_URL"
    : "NAO EXECUTADO - PostgreSQL nao disponivel";

const PREFIXO = "conta-test-";
const SENHA = "senha-do-titular-123";
// `VALID_ALLERGY_IDS` e um Set; aqui precisa de posicao.
const ALERGIAS = [...VALID_ALLERGY_IDS];
const TABELAS_QUE_REFERENCIAM_USERS = ["product_favorites", "product_history", "sessions", "user_allergies"];

after(async () => {
  if (temBanco) await query(`DELETE FROM users WHERE email LIKE '${PREFIXO}%@example.com'`);
  await closePool();
});

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------
//
// As contas sao criadas DIRETO no banco, com o mesmo hash de senha e o mesmo
// formato de sessao do app. Montar cenario pelas rotas de cadastro e login
// gastaria o limitador de autenticacao (40 por 15 minutos, por IP) so com
// preparo - e as tentativas de exclusao, que sao o que se quer medir, tambem
// contam nele.

async function novaSessao(userId) {
  const token = generateSessionToken();
  await createSession(
    { id: generateId(), userId, tokenHash: hashSessionToken(token), expiresAt: getSessionExpiration(env.sessionTtlDays) },
    { query },
  );
  return { token, cookie: `${env.sessionCookieName}=${token}` };
}

async function criarConta({ alergias = [], historico = [], favoritos = [] } = {}) {
  const id = generateId();
  const nome = `titular ${randomUUID().slice(0, 8)}`;
  const email = `${PREFIXO}${randomUUID()}@example.com`;
  const senha = await hashPassword(SENHA);
  await createUser(
    { id, name: nome, nameKey: normalizeNameKey(nome), email, passwordHash: senha.hash, passwordSalt: senha.salt },
    { query },
  );
  if (alergias.length) await replaceUserAllergies(id, alergias, { query });
  for (const p of historico) {
    await query(
      "INSERT INTO product_history (id, user_id, product_code, product_name, product_brand, image_url) VALUES ($1, $2, $3, $4, $5, $6)",
      [generateId(), id, p.codigo, p.nome, p.marca ?? null, p.imagem ?? null],
    );
  }
  for (const p of favoritos) {
    await query(
      "INSERT INTO product_favorites (id, user_id, product_code, product_name, product_brand, image_url) VALUES ($1, $2, $3, $4, $5, $6)",
      [generateId(), id, p.codigo, p.nome, p.marca ?? null, p.imagem ?? null],
    );
  }
  const sessao = await novaSessao(id);
  return { id, nome, email, ...sessao };
}

function produto(rotulo) {
  return { codigo: `7${Math.floor(Math.random() * 1e12).toString().padStart(12, "0")}`, nome: `${rotulo} ${randomUUID().slice(0, 8)}`, marca: "Marca Teste" };
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

// Quantas exportacoes esta suite faz contra a rota real. O limitador por IP e
// um modulo unico, e todas saem de 127.0.0.1: o ultimo teste confere a folga.
let exportacoesFeitas = 0;

async function pedir(base, caminho, { method = "GET", cookie, body, corpoBruto, headers = {} } = {}) {
  if (caminho.startsWith("/api/account/export")) exportacoesFeitas += 1;
  const temCorpo = body !== undefined || corpoBruto !== undefined;
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(temCorpo ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: corpoBruto ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const texto = await resposta.text();
  let corpo = {};
  try {
    corpo = texto ? JSON.parse(texto) : {};
  } catch {
    corpo = { texto };
  }
  return { status: resposta.status, headers: resposta.headers, texto, corpo };
}

// GET com corpo: o `fetch` nao deixa, entao vai pelo `http` cru. E o que um
// cliente malicioso faria para tentar escolher o usuario pelo corpo.
function getComCorpo(base, caminho, cookie, corpo) {
  exportacoesFeitas += 1;
  const json = JSON.stringify(corpo);
  return new Promise((resolve, reject) => {
    const req = requisicaoHttp(`${base}${caminho}`, {
      method: "GET",
      headers: { Cookie: cookie, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(json) },
    });
    req.on("response", (res) => {
      let texto = "";
      res.on("data", (parte) => (texto += parte));
      res.on("end", () => resolve({ status: res.statusCode, texto, corpo: texto ? JSON.parse(texto) : {} }));
    });
    req.on("error", reject);
    req.end(json);
  });
}

async function contagem(userId) {
  const n = async (sql) => (await query(sql, [userId])).rows[0].n;
  return {
    users: await n("SELECT count(*)::int AS n FROM users WHERE id = $1"),
    sessions: await n("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1"),
    allergies: await n("SELECT count(*)::int AS n FROM user_allergies WHERE user_id = $1"),
    history: await n("SELECT count(*)::int AS n FROM product_history WHERE user_id = $1"),
    favorites: await n("SELECT count(*)::int AS n FROM product_favorites WHERE user_id = $1"),
  };
}

// Toda chave de todo nivel do JSON.
function chaves(valor, saida = []) {
  if (Array.isArray(valor)) valor.forEach((item) => chaves(item, saida));
  else if (valor && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      saida.push(chave);
      chaves(filho, saida);
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// E1 - a exportacao traz tudo o que e do titular
// ---------------------------------------------------------------------------

test("E1 a exportacao traz conta, alergias, historico e favoritos do titular", { skip: pular }, async () => {
  const [alergia1, alergia2] = ALERGIAS;
  const h1 = produto("historico");
  const h2 = produto("historico");
  const f1 = produto("favorito");
  const conta = await criarConta({ alergias: [alergia1, alergia2], historico: [h1, h2], favoritos: [f1] });

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account/export", { cookie: conta.cookie });
    assert.equal(r.status, 200, r.texto);
    const d = r.corpo;

    assert.equal(d.formato, "nutriscan-dados-do-titular");
    assert.equal(d.versaoDoFormato, 1);
    assert.ok(!Number.isNaN(Date.parse(d.geradoEm)), "geradoEm nao e um instante");

    assert.equal(d.conta.nome, conta.nome);
    assert.equal(d.conta.email, conta.email);
    assert.ok(!Number.isNaN(Date.parse(d.conta.criadaEm)));

    assert.deepEqual(d.alergias.map((a) => a.id).sort(), [alergia1, alergia2].sort());
    assert.ok(d.alergias.every((a) => typeof a.nome === "string" && a.nome.length > 0), "alergia sem nome legivel");

    assert.deepEqual(d.historico.map((p) => p.codigo).sort(), [h1.codigo, h2.codigo].sort());
    assert.deepEqual(Object.keys(d.historico[0]).sort(), ["codigo", "consultadoEm", "imagem", "marca", "nome"]);
    assert.deepEqual(d.favoritos.map((p) => p.codigo), [f1.codigo]);
    assert.deepEqual(Object.keys(d.favoritos[0]).sort(), ["codigo", "favoritadoEm", "imagem", "marca", "nome"]);
  });
});

// ---------------------------------------------------------------------------
// E2 - o hash de senha REAL nao esta no JSON
// ---------------------------------------------------------------------------

test("E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor", { skip: pular }, async () => {
  const conta = await criarConta({ historico: [produto("h")] });
  const { rows } = await query("SELECT password_hash, password_salt FROM users WHERE id = $1", [conta.id]);
  const { password_hash: hash, password_salt: salt } = rows[0];
  assert.ok(hash.length > 20 && salt.length > 8, "o hash de referencia nao foi lido");

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account/export", { cookie: conta.cookie });
    assert.equal(r.status, 200);
    // Pelo VALOR, como pede o prompt: um campo renomeado continuaria vazando.
    assert.equal(r.texto.includes(hash), false, "o hash de senha real esta na exportacao");
    assert.equal(r.texto.includes(salt), false, "o salt real esta na exportacao");
    // E pelo nome, como segunda rede.
    const proibidas = chaves(r.corpo).filter((c) => /password|hash|salt|senha/i.test(c));
    assert.deepEqual(proibidas, []);
  });
});

// ---------------------------------------------------------------------------
// E3 - nada de sessao, cookie, credencial ou id interno
// ---------------------------------------------------------------------------

test("E3 a exportacao nao contem token de sessao, cookie, credencial nem id interno", { skip: pular }, async () => {
  const conta = await criarConta({ historico: [produto("h")], favoritos: [produto("f")] });
  const outra = await novaSessao(conta.id);
  const { rows: sessoes } = await query("SELECT id, token_hash FROM sessions WHERE user_id = $1", [conta.id]);
  const { rows: linhas } = await query(
    "SELECT id FROM product_history WHERE user_id = $1 UNION ALL SELECT id FROM product_favorites WHERE user_id = $1",
    [conta.id],
  );

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account/export", { cookie: conta.cookie });
    assert.equal(r.status, 200);
    const texto = r.texto;

    for (const valor of [conta.token, outra.token, ...sessoes.map((s) => s.token_hash), ...sessoes.map((s) => s.id)]) {
      assert.equal(texto.includes(valor), false, "a exportacao carrega token, hash ou id de sessao");
    }
    assert.equal(texto.includes(env.sessionCookieName), false, "a exportacao cita o cookie de sessao");
    assert.equal(texto.includes(conta.id), false, "a exportacao carrega o id interno do usuario");
    for (const { id } of linhas) assert.equal(texto.includes(id), false, "a exportacao carrega id interno de linha");

    assert.doesNotMatch(texto, /postgres(ql)?:\/\//i, "string de conexao na exportacao");
    if (env.databaseUrl) assert.equal(texto.includes(env.databaseUrl), false, "DATABASE_URL na exportacao");
    if (env.anthropicApiKey) assert.equal(texto.includes(env.anthropicApiKey), false, "chave da IA na exportacao");
    assert.doesNotMatch(texto, /sk-ant-|ANTHROPIC|DATABASE_URL/);
    const proibidas = chaves(r.corpo).filter((c) => /token|sess|cookie|^id$|user_?id/i.test(c));
    assert.deepEqual(proibidas, []);
  });
});

// ---------------------------------------------------------------------------
// E4 - nenhum byte do vizinho
// ---------------------------------------------------------------------------

test("E4 a exportacao de A nao contem nada de B, com B populado", { skip: pular }, async () => {
  const a = await criarConta({ alergias: [ALERGIAS[0]], historico: [produto("a-hist")], favoritos: [produto("a-fav")] });
  const bHist = produto("b-hist-vizinho");
  const bFav = produto("b-fav-vizinho");
  const b = await criarConta({ alergias: [ALERGIAS[1]], historico: [bHist], favoritos: [bFav] });
  const { rows } = await query("SELECT password_hash, password_salt FROM users WHERE id = $1", [b.id]);

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account/export", { cookie: a.cookie });
    assert.equal(r.status, 200);
    for (const valor of [b.email, b.nome, b.id, b.token, rows[0].password_hash, rows[0].password_salt, bHist.codigo, bHist.nome, bFav.codigo, bFav.nome]) {
      assert.equal(r.texto.includes(valor), false, "a exportacao de A carrega dado de B");
    }
    assert.equal(r.corpo.historico.length, 1);
    assert.equal(r.corpo.favoritos.length, 1);
    assert.deepEqual(r.corpo.alergias.map((x) => x.id), [ALERGIAS[0]]);
  });
});

// ---------------------------------------------------------------------------
// E5 - parametro de requisicao nao escolhe o titular
// ---------------------------------------------------------------------------

test("E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado", { skip: pular }, async () => {
  const a = await criarConta({ historico: [produto("a")] });
  const b = await criarConta({ historico: [produto("b")] });

  await comServidor(async (base) => {
    const tentativas = [
      ["corpo", await getComCorpo(base, "/api/account/export", a.cookie, { userId: b.id, user_id: b.id, email: b.email })],
      ["query", await pedir(base, `/api/account/export?userId=${b.id}&user_id=${b.id}`, { cookie: a.cookie })],
      ["cabecalho", await pedir(base, "/api/account/export", { cookie: a.cookie, headers: { "X-User-Id": b.id, "User-Id": b.id } })],
    ];
    for (const [onde, r] of tentativas) {
      assert.equal(r.status, 200, `${onde}: ${r.texto}`);
      assert.equal(r.corpo.conta.email, a.email, `userId no ${onde} trocou o titular exportado`);
      assert.equal(r.texto.includes(b.email), false, `userId no ${onde} trouxe dado de B`);
    }
  });
});

// ---------------------------------------------------------------------------
// E7 - nome do arquivo e cabecalhos de cache
// ---------------------------------------------------------------------------

test("E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache", { skip: pular }, async () => {
  const conta = await criarConta();
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account/export", { cookie: conta.cookie });
    assert.equal(r.status, 200);

    const disposicao = r.headers.get("content-disposition") || "";
    const nome = /filename="([^"]+)"/.exec(disposicao)?.[1];
    assert.match(disposicao, /^attachment;/);
    assert.match(nome ?? "", /^nutriscan-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
    const [local] = conta.email.split("@");
    for (const proibido of [conta.email, local, conta.nome, ...conta.nome.split(" ")]) {
      assert.equal(nome.includes(proibido), false, "o nome do arquivo carrega dado do titular");
    }

    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("pragma"), "no-cache");
  });
});

// ---------------------------------------------------------------------------
// E8 - o limitador na ROTA de verdade
// ---------------------------------------------------------------------------

test("E8 a rota real recusa a exportacao acima do teto do usuario", { skip: pular }, async () => {
  const conta = await criarConta();
  await comServidor(async (base) => {
    for (let i = 1; i <= TETO_EXPORTACAO_POR_USUARIO; i += 1) {
      const r = await pedir(base, "/api/account/export", { cookie: conta.cookie });
      assert.equal(r.status, 200, `exportacao ${i} recusada: ${r.texto}`);
    }
    const acima = await pedir(base, "/api/account/export", { cookie: conta.cookie });
    assert.equal(acima.status, 429, "a exportacao acima do teto passou");
  });
});

// ---------------------------------------------------------------------------
// D1 a D3 - confirmacao forte
// ---------------------------------------------------------------------------

test("D1 exclusao com a senha correta remove a conta e limpa o cookie", { skip: pular }, async () => {
  const conta = await criarConta({ alergias: [ALERGIAS[0]], historico: [produto("h")], favoritos: [produto("f")] });
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: SENHA } });
    assert.equal(r.status, 200, r.texto);
    assert.deepEqual(r.corpo, { ok: true });

    const setCookie = r.headers.get("set-cookie") || "";
    assert.match(setCookie, new RegExp(`${env.sessionCookieName}=;`), "o cookie de sessao nao foi limpo");
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);
  });
  assert.deepEqual(await contagem(conta.id), { users: 0, sessions: 0, allergies: 0, history: 0, favorites: 0 });
});

test("D2 exclusao com senha errada nao remove nada", { skip: pular }, async () => {
  const conta = await criarConta({ alergias: [ALERGIAS[0]], historico: [produto("h")], favoritos: [produto("f")] });
  const antes = await contagem(conta.id);
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: "senha-errada" } });
    assert.equal(r.status, 403, r.texto);
    assert.equal(r.corpo.error.code, "INVALID_CREDENTIALS");
    assert.equal(r.corpo.error.message, "Senha incorreta. Nada foi apagado.");
    assert.equal(r.headers.get("set-cookie"), null, "o cookie foi mexido numa recusa");

    // A sessao continua valendo: a recusa nao desloga ninguem.
    assert.equal((await pedir(base, "/api/auth/me", { cookie: conta.cookie })).status, 200);
  });
  assert.deepEqual(await contagem(conta.id), antes);
});

test("D3 exclusao sem senha, com corpo vazio ou com JSON quebrado nao remove nada", { skip: pular }, async () => {
  const conta = await criarConta({ historico: [produto("h")] });
  const antes = await contagem(conta.id);
  await comServidor(async (base) => {
    const semSenha = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { userId: conta.id } });
    assert.equal(semSenha.status, 400);
    assert.equal(semSenha.corpo.error.code, "VALIDATION_ERROR");

    const semCorpo = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie });
    assert.equal(semCorpo.status, 400);

    const quebrado = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, corpoBruto: "{ senha" });
    assert.equal(quebrado.status, 400);
    assert.equal(quebrado.corpo.error.code, "INVALID_JSON");
  });
  assert.deepEqual(await contagem(conta.id), antes);
});

// ---------------------------------------------------------------------------
// D4 - nenhuma linha em NENHUMA tabela referencia o usuario removido
// ---------------------------------------------------------------------------

// Varre o banco inteiro: toda coluna de texto ou uuid de toda tabela do schema,
// procurando o id e o e-mail do usuario. Nao depende de saber quais tabelas
// existem - uma tabela nova, sem cascata, aparece aqui.
async function referenciasNoBanco(valores) {
  const { rows: colunas } = await query(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('uuid', 'text', 'character varying')`);
  const achados = [];
  for (const { table_name: tabela, column_name: coluna } of colunas) {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM "${tabela}" WHERE "${coluna}"::text = ANY($1::text[])`,
      [valores],
    );
    if (rows[0].n) achados.push(`${tabela}.${coluna}: ${rows[0].n}`);
  }
  return { achados, colunas: colunas.length, tabelas: new Set(colunas.map((c) => c.table_name)) };
}

test("D4 apos a exclusao, nenhuma linha em nenhuma tabela referencia o usuario", { skip: pular }, async () => {
  const conta = await criarConta({ alergias: ALERGIAS.slice(0, 3), historico: [produto("h"), produto("h")], favoritos: [produto("f")] });
  await novaSessao(conta.id);

  const antes = await referenciasNoBanco([conta.id, conta.email]);
  assert.ok(antes.achados.length >= 5, `o cenario nao populou as tabelas: ${antes.achados.join(", ")}`);
  for (const tabela of TABELAS_QUE_REFERENCIAM_USERS) assert.ok(antes.tabelas.has(tabela), `${tabela} nao foi varrida`);

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: SENHA } });
    assert.equal(r.status, 200, r.texto);
  });

  const depois = await referenciasNoBanco([conta.id, conta.email]);
  assert.deepEqual(depois.achados, [], "sobrou linha referenciando o usuario excluido");
});

// Toda chave estrangeira para `users`, com a acao de ON DELETE, num schema.
async function chavesParaUsers(cliente, schema) {
  const { rows: fks } = await cliente.query(
    `SELECT cls.relname AS tabela, con.confdeltype AS acao
       FROM pg_constraint con
       JOIN pg_class cls ON cls.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cls.relnamespace
       JOIN pg_class alvo ON alvo.oid = con.confrelid
      WHERE con.contype = 'f' AND ns.nspname = $1 AND alvo.relname = 'users'
      ORDER BY 1`,
    [schema],
  );
  const { rows: comUserId } = await cliente.query(
    "SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = $1 AND column_name = 'user_id' ORDER BY 1",
    [schema],
  );
  return { fks, tabelasComUserId: comUserId.map((r) => r.table_name) };
}

function conferirCascatas({ fks, tabelasComUserId }) {
  assert.deepEqual(fks.map((f) => f.tabela), TABELAS_QUE_REFERENCIAM_USERS, "a lista de tabelas que referenciam users mudou");
  for (const { tabela, acao } of fks) {
    assert.equal(acao, "c", `${tabela} referencia users SEM ON DELETE CASCADE`);
  }
  // Uma tabela nova com `user_id` e sem chave estrangeira escaparia da cascata
  // E da lista acima. Aqui ela aparece.
  assert.deepEqual(tabelasComUserId, TABELAS_QUE_REFERENCIAM_USERS, "tabela com user_id sem chave estrangeira para users");
}

test("D4 no banco real, toda tabela que referencia users tem ON DELETE CASCADE", { skip: pular }, async () => {
  const cliente = { query };
  conferirCascatas(await chavesParaUsers(cliente, "public"));
});

test("D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users", { skip: pular }, async () => {
  // O banco de teste ja foi migrado; mudar uma migration nao muda ele. Para
  // provar que a CASCATA ESTA NAS MIGRATIONS - que e o que um banco novo, como
  // o de producao recriado, vai receber - o schema e montado do zero, num
  // schema temporario, rodando os arquivos de `migrations/` em ordem.
  const schema = `nutriscan_cascata_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const cliente = new pg.Client({
    connectionString: env.databaseUrl,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await cliente.connect();
  try {
    await cliente.query(`CREATE SCHEMA ${schema}`);
    await cliente.query(`SET search_path TO ${schema}, public`);
    const pasta = path.join(backendRoot, "migrations");
    for (const arquivo of (await readdir(pasta)).filter((f) => f.endsWith(".sql") || f.endsWith(".js")).sort()) {
      if (arquivo.endsWith(".sql")) {
        await cliente.query(await readFile(path.join(pasta, arquivo), "utf8"));
      } else {
        const { up } = await import(pathToFileURL(path.join(pasta, arquivo)).href);
        await up(cliente);
      }
    }
    conferirCascatas(await chavesParaUsers(cliente, schema));
  } finally {
    await cliente.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await cliente.end();
  }
});

// ---------------------------------------------------------------------------
// D5 - todas as sessoes, em todos os aparelhos
// ---------------------------------------------------------------------------

test("D5 apos a exclusao, todas as sessoes do usuario deixam de autenticar - 401, nao 500", { skip: pular }, async () => {
  const conta = await criarConta();
  const celular = await novaSessao(conta.id);
  const tablet = await novaSessao(conta.id);
  assert.equal((await contagem(conta.id)).sessions, 3);

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: SENHA } });
    assert.equal(r.status, 200);

    for (const [aparelho, cookie] of [["o que excluiu", conta.cookie], ["celular", celular.cookie], ["tablet", tablet.cookie]]) {
      const me = await pedir(base, "/api/auth/me", { cookie });
      assert.equal(me.status, 401, `a sessao do ${aparelho} sobreviveu a exclusao (${me.status})`);
      const exportar = await pedir(base, "/api/account/export", { cookie });
      assert.equal(exportar.status, 401, `o ${aparelho} ainda exporta`);
    }
  });
  assert.equal((await contagem(conta.id)).sessions, 0);
});

// ---------------------------------------------------------------------------
// D6 - o vizinho continua intacto
// ---------------------------------------------------------------------------

test("D6 a exclusao de A deixa B intacto: historico, favoritos, alergias e login", { skip: pular }, async () => {
  const a = await criarConta({ alergias: [ALERGIAS[0]], historico: [produto("a")], favoritos: [produto("a")] });
  const b = await criarConta({ alergias: ALERGIAS.slice(1, 3), historico: [produto("b"), produto("b")], favoritos: [produto("b")] });
  const bAntes = await contagem(b.id);

  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: a.cookie, body: { password: SENHA } });
    assert.equal(r.status, 200);

    assert.equal((await pedir(base, "/api/auth/me", { cookie: b.cookie })).status, 200, "a sessao de B caiu");
    const login = await pedir(base, "/api/auth/login", { method: "POST", body: { identifier: b.email, password: SENHA } });
    assert.equal(login.status, 200, `B nao consegue mais entrar: ${login.texto}`);
    assert.deepEqual(login.corpo.user.allergies.sort(), ALERGIAS.slice(1, 3).sort());
  });
  const bDepois = await contagem(b.id);
  // O login acima abriu uma sessao a mais para B; o resto tem de ser identico.
  assert.deepEqual({ ...bDepois, sessions: bDepois.sessions - 1 }, bAntes);
});

// ---------------------------------------------------------------------------
// D7 - e-mail e nome livres para novo cadastro
// ---------------------------------------------------------------------------

test("D7 e-mail e nome voltam a ficar disponiveis para novo cadastro", { skip: pular }, async () => {
  const conta = await criarConta();
  await comServidor(async (base) => {
    const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: SENHA } });
    assert.equal(r.status, 200);

    const novo = await pedir(base, "/api/auth/register", {
      method: "POST",
      body: { name: conta.nome, email: conta.email, password: SENHA, allergies: [] },
    });
    assert.equal(novo.status, 201, `recadastro bloqueado: ${novo.texto}`);
    assert.notEqual(novo.corpo.user.id, conta.id, "o recadastro ressuscitou a conta antiga");
  });
});

// ---------------------------------------------------------------------------
// D8 - falha no meio: nada e removido
// ---------------------------------------------------------------------------

test("D8 falha simulada no meio da exclusao deixa o estado anterior intacto", { skip: pular }, async () => {
  const conta = await criarConta({ alergias: [ALERGIAS[0]], historico: [produto("h")], favoritos: [produto("f")] });
  await novaSessao(conta.id);
  const antes = await contagem(conta.id);

  // A falha e REAL, no banco, e no meio do caminho: um gatilho que recusa a
  // remocao do favorito DESTE usuario. A exclusao ja apagou as sessoes quando a
  // cascata chega nos favoritos e o gatilho explode. Nenhum gancho no codigo de
  // producao: o app nao sabe que esta sendo testado.
  const sufixo = randomUUID().replace(/-/g, "").slice(0, 12);
  const funcao = `nutriscan_teste_falha_${sufixo}`;
  const gatilho = `nutriscan_teste_gatilho_${sufixo}`;
  await query(`CREATE FUNCTION ${funcao}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'falha simulada no meio da exclusao'; END $$`);
  await query(`CREATE TRIGGER ${gatilho} BEFORE DELETE ON product_favorites FOR EACH ROW
    WHEN (OLD.user_id = '${conta.id}'::uuid) EXECUTE FUNCTION ${funcao}()`);

  try {
    await comServidor(async (base) => {
      const r = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: SENHA } });
      assert.equal(r.status, 500, `a exclusao com falha respondeu ${r.status}`);
      assert.equal(r.headers.get("set-cookie"), null, "o cookie foi limpo numa exclusao que falhou");

      // A sessao - apagada ANTES da falha - voltou com o ROLLBACK.
      assert.equal((await pedir(base, "/api/auth/me", { cookie: conta.cookie })).status, 200, "a sessao sumiu");
    });
    assert.deepEqual(await contagem(conta.id), antes, "a exclusao com falha deixou a conta pela metade");
  } finally {
    await query(`DROP TRIGGER IF EXISTS ${gatilho} ON product_favorites`);
    await query(`DROP FUNCTION IF EXISTS ${funcao}()`);
  }
});

// ---------------------------------------------------------------------------
// D9 - a tentativa com senha errada conta no limitador de AUTENTICACAO
// ---------------------------------------------------------------------------

test("D9 a tentativa com senha errada gasta o mesmo balde do login", { skip: pular }, async () => {
  const conta = await criarConta();
  await comServidor(async (base) => {
    const tentativa = await pedir(base, "/api/account", { method: "DELETE", cookie: conta.cookie, body: { password: "errada" } });
    assert.equal(tentativa.status, 403);
    assert.equal(tentativa.headers.get("ratelimit-limit"), "40", "a exclusao nao passa pelo limitador de autenticacao");
    const restanteDepoisDaExclusao = Number(tentativa.headers.get("ratelimit-remaining"));

    const login = await pedir(base, "/api/auth/login", { method: "POST", body: { identifier: conta.email, password: "errada" } });
    assert.equal(login.status, 401);
    // O login, logo em seguida, ve o balde UM a menos: a tentativa de exclusao
    // foi contada no mesmo lugar que uma tentativa de login.
    assert.equal(Number(login.headers.get("ratelimit-remaining")), restanteDepoisDaExclusao - 1);
  });
});

// ---------------------------------------------------------------------------
// Folga do limitador de exportacao nesta suite
// ---------------------------------------------------------------------------

test("as exportacoes desta suite cabem no teto por IP", { skip: pular }, () => {
  console.log(`[exportacao] desta suite: ${exportacoesFeitas} de ${TETO_EXPORTACAO_POR_IP} por IP`);
  assert.ok(exportacoesFeitas < TETO_EXPORTACAO_POR_IP, "a suite encostou no teto de exportacao por IP");
});
