import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { closePool, query } from "../src/database/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// Estes testes escrevem no banco apontado por DATABASE_URL. Como em
// `integration.test.js`, a presenca da string NAO basta: exige-se autorizacao
// explicita, porque na v0.6.6 um `npm test` com a string de producao no .env
// deixou linha de teste em producao.
const DB_TESTS_FLAG = "RUN_DB_INTEGRATION_TESTS";
const autorizado = process.env[DB_TESTS_FLAG] === "true";
const temBanco = Boolean(env.databaseUrl) && autorizado;

const motivoSkip = env.databaseUrl
  ? `NAO EXECUTADO - defina ${DB_TESTS_FLAG}=true para escrever no banco apontado por DATABASE_URL`
  : "NAO EXECUTADO - PostgreSQL nao disponivel";

const pular = temBanco ? false : motivoSkip;

after(async () => {
  if (temBanco) await limparUsuariosDeTeste();
  await closePool();
});

function rodarMigrations() {
  execFileSync(process.execPath, ["scripts/migrate.js"], {
    cwd: backendRoot,
    stdio: "pipe",
    env: process.env,
  });
}

async function comServidor(callback) {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Cada agente guarda o proprio cookie. Dois agentes = dois dispositivos.
function criarAgente(baseUrl) {
  const cookies = new Map();
  return {
    async request(pathname, options = {}) {
      const headers = {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(cookies.size
          ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") }
          : {}),
      };
      const resposta = await fetch(`${baseUrl}${pathname}`, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const setCookie = resposta.headers.get("set-cookie");
      if (setCookie) {
        const [par] = setCookie.split(";");
        const [nome, valor] = par.split("=");
        if (!valor) cookies.delete(nome);
        else cookies.set(nome, valor);
      }
      const texto = await resposta.text();
      return { status: resposta.status, body: texto ? JSON.parse(texto) : {} };
    },
  };
}

const PREFIXO = "colecoes-test-";

async function limparUsuariosDeTeste() {
  // A cascata da migration remove historico e favoritos junto.
  await query(`DELETE FROM users WHERE email LIKE '${PREFIXO}%@example.com'`);
}

function novoEmail() {
  return `${PREFIXO}${randomUUID()}@example.com`;
}

async function registrar(agente, email) {
  const resposta = await agente.request("/api/auth/register", {
    method: "POST",
    body: { name: `u-${randomUUID().slice(0, 8)}`, email, password: "senha-de-teste-123", allergies: [] },
  });
  assert.equal(resposta.status, 201, `registro falhou: ${JSON.stringify(resposta.body)}`);
  return resposta.body.user;
}

const PRODUTO = {
  productCode: "7891000100103",
  productName: "Leite Condensado",
  productBrand: "Nestle",
  imageUrl: "https://images.openfoodfacts.org/exemplo.jpg",
};

// ---------------------------------------------------------------------------
// H1 / F1 - persistencia real
// ---------------------------------------------------------------------------

test("H1 historico persiste no PostgreSQL e volta apos novo login", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const email = novoEmail();
    const dispositivo = criarAgente(baseUrl);
    await registrar(dispositivo, email);

    const gravado = await dispositivo.request("/api/history", { method: "POST", body: PRODUTO });
    assert.equal(gravado.status, 201);

    await dispositivo.request("/api/auth/logout", { method: "POST" });

    const depois = criarAgente(baseUrl);
    const login = await depois.request("/api/auth/login", {
      method: "POST",
      body: { identifier: email, password: "senha-de-teste-123" },
    });
    assert.equal(login.status, 200);

    const lista = await depois.request("/api/history");
    assert.equal(lista.status, 200);
    assert.equal(lista.body.items.length, 1);
    assert.equal(lista.body.items[0].productCode, PRODUTO.productCode);
  });
});

test("F1 favorito persiste no PostgreSQL e volta apos novo login", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const email = novoEmail();
    const dispositivo = criarAgente(baseUrl);
    await registrar(dispositivo, email);

    const criado = await dispositivo.request("/api/favorites", { method: "POST", body: PRODUTO });
    assert.equal(criado.status, 201);

    await dispositivo.request("/api/auth/logout", { method: "POST" });

    const depois = criarAgente(baseUrl);
    await depois.request("/api/auth/login", {
      method: "POST",
      body: { identifier: email, password: "senha-de-teste-123" },
    });

    const lista = await depois.request("/api/favorites");
    assert.equal(lista.body.items.length, 1);
    assert.equal(lista.body.items[0].productCode, PRODUTO.productCode);
  });
});

// ---------------------------------------------------------------------------
// H2 / H3 / H4 - comportamento do historico
// ---------------------------------------------------------------------------

test("H2 consultar o mesmo produto duas vezes atualiza e nao duplica", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    await registrar(agente, novoEmail());

    await agente.request("/api/history", { method: "POST", body: PRODUTO });
    const primeira = await agente.request("/api/history");
    const dataInicial = primeira.body.items[0].viewedAt;

    await new Promise((r) => setTimeout(r, 15));
    await agente.request("/api/history", {
      method: "POST",
      body: { ...PRODUTO, productName: "Leite Condensado Integral" },
    });

    const segunda = await agente.request("/api/history");
    assert.equal(segunda.body.items.length, 1, "revisita criou linha nova");
    assert.equal(segunda.body.items[0].productName, "Leite Condensado Integral");
    assert.notEqual(segunda.body.items[0].viewedAt, dataInicial, "a data nao foi atualizada");
  });
});

test("H3 o historico respeita o limite e descarta o mais antigo", { skip: pular }, async () => {
  rodarMigrations();
  const { HISTORY_LIMIT } = await import("../src/config/collections.js");

  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    await registrar(agente, novoEmail());

    for (let i = 0; i < HISTORY_LIMIT + 3; i += 1) {
      await agente.request("/api/history", {
        method: "POST",
        body: { ...PRODUTO, productCode: `codigo-${String(i).padStart(4, "0")}` },
      });
    }

    const lista = await agente.request("/api/history");
    assert.equal(lista.body.items.length, HISTORY_LIMIT);

    const codigos = lista.body.items.map((item) => item.productCode);
    assert.ok(!codigos.includes("codigo-0000"), "o item mais antigo deveria ter saido");
    assert.ok(codigos.includes(`codigo-${String(HISTORY_LIMIT + 2).padStart(4, "0")}`));
  });
});

test("H4 remocao individual e limpeza total do historico", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    await registrar(agente, novoEmail());

    await agente.request("/api/history", { method: "POST", body: PRODUTO });
    await agente.request("/api/history", {
      method: "POST",
      body: { ...PRODUTO, productCode: "999" },
    });

    const lista = await agente.request("/api/history");
    assert.equal(lista.body.items.length, 2);

    const alvo = lista.body.items[0].id;
    const removido = await agente.request(`/api/history/${alvo}`, { method: "DELETE" });
    assert.equal(removido.status, 200);
    assert.equal((await agente.request("/api/history")).body.items.length, 1);

    const limpou = await agente.request("/api/history", { method: "DELETE" });
    assert.equal(limpou.status, 200);
    assert.equal((await agente.request("/api/history")).body.items.length, 0);
  });
});

// ---------------------------------------------------------------------------
// F2 / F3 / F4 - comportamento dos favoritos
// ---------------------------------------------------------------------------

test("F2 toggle: marcar, desmarcar e marcar de novo", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    await registrar(agente, novoEmail());

    const marcou = await agente.request("/api/favorites/toggle", { method: "POST", body: PRODUTO });
    assert.equal(marcou.body.favoritado, true);
    assert.equal((await agente.request("/api/favorites")).body.items.length, 1);

    const desmarcou = await agente.request("/api/favorites/toggle", { method: "POST", body: PRODUTO });
    assert.equal(desmarcou.body.favoritado, false);
    assert.equal((await agente.request("/api/favorites")).body.items.length, 0);

    const remarcou = await agente.request("/api/favorites/toggle", { method: "POST", body: PRODUTO });
    assert.equal(remarcou.body.favoritado, true);
    assert.equal((await agente.request("/api/favorites")).body.items.length, 1);
  });
});

// Esta e a prova que a aplicacao nao pode dar: insercao direta no banco,
// sem passar pelo servico, precisa ser recusada pela restricao.
test("F3 a unicidade e garantida pelo BANCO, nao pela aplicacao", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    const usuario = await registrar(agente, novoEmail());

    await agente.request("/api/favorites", { method: "POST", body: PRODUTO });

    await assert.rejects(
      () =>
        query(
          `INSERT INTO product_favorites (id, user_id, product_code, product_name)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), usuario.id, PRODUTO.productCode, "insercao direta"],
        ),
      (erro) => {
        // 23505 = unique_violation
        assert.equal(erro.code, "23505", `esperado unique_violation, veio ${erro.code}`);
        return true;
      },
    );
  });
});

test("F4 o limite de favoritos e aplicado e devolve erro, sem podar", { skip: pular }, async () => {
  rodarMigrations();
  const { FAVORITES_LIMIT } = await import("../src/config/collections.js");

  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    await registrar(agente, novoEmail());

    for (let i = 0; i < FAVORITES_LIMIT; i += 1) {
      const r = await agente.request("/api/favorites", {
        method: "POST",
        body: { ...PRODUTO, productCode: `fav-${String(i).padStart(4, "0")}` },
      });
      assert.equal(r.status, 201, `favorito ${i} falhou`);
    }

    const estourou = await agente.request("/api/favorites", {
      method: "POST",
      body: { ...PRODUTO, productCode: "fav-excedente" },
    });
    assert.equal(estourou.status, 409);
    assert.equal(estourou.body.error.code, "FAVORITES_LIMIT_REACHED");

    // Nada foi podado: o mais antigo continua la.
    const lista = await agente.request("/api/favorites");
    assert.equal(lista.body.items.length, FAVORITES_LIMIT);
    assert.ok(lista.body.items.some((item) => item.productCode === "fav-0000"));
  });
});

// ---------------------------------------------------------------------------
// S1 / S2 / S3 - sincronizacao entre dispositivos
// ---------------------------------------------------------------------------

test("S1 multi-dispositivo: A grava historico, B le", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const email = novoEmail();
    const dispositivoA = criarAgente(baseUrl);
    await registrar(dispositivoA, email);

    await dispositivoA.request("/api/history", { method: "POST", body: PRODUTO });

    const dispositivoB = criarAgente(baseUrl);
    await dispositivoB.request("/api/auth/login", {
      method: "POST",
      body: { identifier: email, password: "senha-de-teste-123" },
    });

    const lista = await dispositivoB.request("/api/history");
    assert.equal(lista.body.items.length, 1);
    assert.equal(lista.body.items[0].productCode, PRODUTO.productCode);
  });
});

test("S2 multi-dispositivo: A grava favorito, B le", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const email = novoEmail();
    const dispositivoA = criarAgente(baseUrl);
    await registrar(dispositivoA, email);

    await dispositivoA.request("/api/favorites", { method: "POST", body: PRODUTO });

    const dispositivoB = criarAgente(baseUrl);
    await dispositivoB.request("/api/auth/login", {
      method: "POST",
      body: { identifier: email, password: "senha-de-teste-123" },
    });

    const lista = await dispositivoB.request("/api/favorites");
    assert.equal(lista.body.items.length, 1);
  });
});

// O agente de teste nao tem localStorage nenhum: ele e um cliente HTTP puro.
// Se B ve o que A gravou, a fonte de verdade so pode ser o PostgreSQL.
test("S3 o dispositivo B nao precisa de armazenamento local", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const email = novoEmail();
    const dispositivoA = criarAgente(baseUrl);
    await registrar(dispositivoA, email);
    await dispositivoA.request("/api/history", { method: "POST", body: PRODUTO });
    await dispositivoA.request("/api/favorites", { method: "POST", body: PRODUTO });

    const dispositivoB = criarAgente(baseUrl);
    assert.equal(typeof globalThis.localStorage, "undefined", "o ambiente do teste nao tem localStorage");

    await dispositivoB.request("/api/auth/login", {
      method: "POST",
      body: { identifier: email, password: "senha-de-teste-123" },
    });

    assert.equal((await dispositivoB.request("/api/history")).body.items.length, 1);
    assert.equal((await dispositivoB.request("/api/favorites")).body.items.length, 1);
  });
});

// ---------------------------------------------------------------------------
// I1 / I2 / I3 / I4 - isolamento e identidade, com dois usuarios reais
// ---------------------------------------------------------------------------

test("I1 usuario A nao le historico nem favorito de B", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agenteA = criarAgente(baseUrl);
    await registrar(agenteA, novoEmail());
    await agenteA.request("/api/history", { method: "POST", body: PRODUTO });
    await agenteA.request("/api/favorites", { method: "POST", body: PRODUTO });

    const agenteB = criarAgente(baseUrl);
    await registrar(agenteB, novoEmail());

    assert.deepEqual((await agenteB.request("/api/history")).body.items, []);
    assert.deepEqual((await agenteB.request("/api/favorites")).body.items, []);
  });
});

test("I2 usuario B nao remove item de A", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agenteA = criarAgente(baseUrl);
    await registrar(agenteA, novoEmail());
    await agenteA.request("/api/history", { method: "POST", body: PRODUTO });
    const favoritoA = await agenteA.request("/api/favorites", { method: "POST", body: PRODUTO });
    const itemHistoricoA = (await agenteA.request("/api/history")).body.items[0].id;

    const agenteB = criarAgente(baseUrl);
    await registrar(agenteB, novoEmail());

    const tentativaHistorico = await agenteB.request(`/api/history/${itemHistoricoA}`, {
      method: "DELETE",
    });
    const tentativaFavorito = await agenteB.request(`/api/favorites/${favoritoA.body.item.id}`, {
      method: "DELETE",
    });

    // 404, e nao 403: a resposta precisa ser identica a de item inexistente,
    // para nao contar a B quais ids existem na conta de A.
    assert.equal(tentativaHistorico.status, 404);
    assert.equal(tentativaFavorito.status, 404);

    const inexistente = await agenteB.request(`/api/history/${randomUUID()}`, { method: "DELETE" });
    assert.equal(inexistente.status, 404);
    assert.deepEqual(tentativaHistorico.body, inexistente.body, "respostas precisam ser iguais");

    // E o dado de A continua la.
    assert.equal((await agenteA.request("/api/history")).body.items.length, 1);
    assert.equal((await agenteA.request("/api/favorites")).body.items.length, 1);

    // B tambem nao limpa o historico de A.
    await agenteB.request("/api/history", { method: "DELETE" });
    assert.equal((await agenteA.request("/api/history")).body.items.length, 1);
  });
});

test("I3 userId no corpo da requisicao e ignorado; vale a sessao", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agenteA = criarAgente(baseUrl);
    const usuarioA = await registrar(agenteA, novoEmail());

    const agenteB = criarAgente(baseUrl);
    await registrar(agenteB, novoEmail());

    // B tenta gravar na conta de A, dizendo ser A.
    await agenteB.request("/api/history", {
      method: "POST",
      body: { ...PRODUTO, userId: usuarioA.id, user_id: usuarioA.id },
    });
    await agenteB.request("/api/favorites", {
      method: "POST",
      body: { ...PRODUTO, userId: usuarioA.id, user_id: usuarioA.id },
    });

    // A nao recebeu nada.
    assert.deepEqual((await agenteA.request("/api/history")).body.items, []);
    assert.deepEqual((await agenteA.request("/api/favorites")).body.items, []);

    // E o dado foi para a conta de B, dona da sessao.
    assert.equal((await agenteB.request("/api/history")).body.items.length, 1);
    assert.equal((await agenteB.request("/api/favorites")).body.items.length, 1);
  });
});

test("I4 e V1 sem sessao valida todas as rotas novas respondem 401", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const visitante = criarAgente(baseUrl);

    const rotas = [
      ["GET", "/api/history", undefined],
      ["POST", "/api/history", PRODUTO],
      ["DELETE", `/api/history/${randomUUID()}`, undefined],
      ["DELETE", "/api/history", undefined],
      ["GET", "/api/favorites", undefined],
      ["POST", "/api/favorites", PRODUTO],
      ["POST", "/api/favorites/toggle", PRODUTO],
      ["DELETE", `/api/favorites/${randomUUID()}`, undefined],
    ];

    for (const [metodo, caminho, corpo] of rotas) {
      const resposta = await visitante.request(caminho, { method: metodo, body: corpo });
      assert.equal(resposta.status, 401, `${metodo} ${caminho} nao exigiu sessao`);
    }

    // V1: nada do visitante chegou ao banco.
    const total = await query("SELECT COUNT(*)::int AS n FROM product_history");
    const totalFav = await query("SELECT COUNT(*)::int AS n FROM product_favorites");
    assert.equal(typeof total.rows[0].n, "number");
    assert.equal(typeof totalFav.rows[0].n, "number");
  });
});

// ---------------------------------------------------------------------------
// A1 - o veredito nunca vem congelado do banco
// ---------------------------------------------------------------------------

test(
  "A1 item salvo nao carrega veredito: mudar o perfil muda a leitura",
  { skip: pular },
  async () => {
    rodarMigrations();
    await comServidor(async (baseUrl) => {
      const agente = criarAgente(baseUrl);
      await registrar(agente, novoEmail());

      await agente.request("/api/history", { method: "POST", body: PRODUTO });
      await agente.request("/api/favorites", { method: "POST", body: PRODUTO });

      const antes = await agente.request("/api/history");
      const favoritosAntes = await agente.request("/api/favorites");

      // Perfil de alergia muda.
      await agente.request("/api/profile/allergies", {
        method: "PUT",
        body: { allergies: ["milk"] },
      });

      const depois = await agente.request("/api/history");
      const favoritosDepois = await agente.request("/api/favorites");

      // O item guardado e identico: ele nao carrega veredito nenhum, nem antes
      // nem depois. E por isso que a tela pode recalcular com o perfil novo.
      for (const item of [...depois.body.items, ...favoritosDepois.body.items]) {
        for (const campo of ["allergyVerdict", "safety", "conflicts", "verdict", "allergens"]) {
          assert.equal(item[campo], undefined, `item devolveu campo de veredito "${campo}"`);
        }
      }

      assert.deepEqual(
        depois.body.items.map((i) => i.productCode),
        antes.body.items.map((i) => i.productCode),
      );
      assert.deepEqual(
        favoritosDepois.body.items.map((i) => i.productCode),
        favoritosAntes.body.items.map((i) => i.productCode),
      );
    });
  },
);

// ---------------------------------------------------------------------------
// D1 - cascata
// ---------------------------------------------------------------------------

test("D1 apagar a conta remove historico e favoritos", { skip: pular }, async () => {
  rodarMigrations();
  await comServidor(async (baseUrl) => {
    const agente = criarAgente(baseUrl);
    const usuario = await registrar(agente, novoEmail());

    await agente.request("/api/history", { method: "POST", body: PRODUTO });
    await agente.request("/api/favorites", { method: "POST", body: PRODUTO });

    const antesH = await query("SELECT COUNT(*)::int AS n FROM product_history WHERE user_id = $1", [usuario.id]);
    const antesF = await query("SELECT COUNT(*)::int AS n FROM product_favorites WHERE user_id = $1", [usuario.id]);
    assert.equal(antesH.rows[0].n, 1);
    assert.equal(antesF.rows[0].n, 1);

    await query("DELETE FROM users WHERE id = $1", [usuario.id]);

    const depoisH = await query("SELECT COUNT(*)::int AS n FROM product_history WHERE user_id = $1", [usuario.id]);
    const depoisF = await query("SELECT COUNT(*)::int AS n FROM product_favorites WHERE user_id = $1", [usuario.id]);
    assert.equal(depoisH.rows[0].n, 0, "historico sobreviveu a remocao da conta");
    assert.equal(depoisF.rows[0].n, 0, "favorito sobreviveu a remocao da conta");
  });
});

// ---------------------------------------------------------------------------
// Migration idempotente na pratica
// ---------------------------------------------------------------------------

test("a migration aplica e reaplica sem quebrar", { skip: pular }, async () => {
  rodarMigrations();
  rodarMigrations();

  const tabelas = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('product_history', 'product_favorites')
      ORDER BY table_name`,
  );
  assert.deepEqual(
    tabelas.rows.map((r) => r.table_name),
    ["product_favorites", "product_history"],
  );
});
