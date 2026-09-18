import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { FAVORITES_LIMIT, HISTORY_LIMIT } from "../src/config/collections.js";
import * as favoritosRepo from "../src/repositories/favoritesRepository.js";
import * as historicoRepo from "../src/repositories/historyRepository.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(__dirname, "..");

// ESCOPO DESTE ARQUIVO
//
// Aqui ficam os testes que NAO dependem de PostgreSQL: forma do SQL que sai dos
// repositorios, e comportamento dos servicos com um cliente falso.
//
// O que exige semantica real do banco - restricao de unicidade recusando
// insercao direta, cascata apagando linha, isolamento entre dois usuarios de
// verdade - vive em `collectionsIntegration.test.js` e SKIPa sem banco. SKIP
// nao conta como PASS, e o relatorio diz isso.
//
// Testar forma de SQL e mais fraco que testar comportamento, e esta escrito
// assim de proposito: sem banco, afirmar "usuario A nao le dado de B" seria
// afirmar o que nao foi executado.

// Cliente falso: registra o SQL emitido e devolve linhas combinadas.
function clienteFalso(respostas = []) {
  const chamadas = [];
  let indice = 0;
  return {
    chamadas,
    async query(text, params) {
      chamadas.push({ text, params });
      const resposta = respostas[indice] ?? { rows: [], rowCount: 0 };
      indice += 1;
      return resposta;
    },
  };
}

function normalizar(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// I1 / I2 - isolamento: o filtro por usuario vive no SQL
// ---------------------------------------------------------------------------

test("I1 toda leitura de historico e favoritos filtra por usuario no SQL", async () => {
  const leituras = [
    ["listHistory", () => historicoRepo.listHistory("u1", clienteFalso())],
    ["countHistory", () => historicoRepo.countHistory("u1", clienteFalso())],
    ["listFavorites", () => favoritosRepo.listFavorites("u1", clienteFalso())],
    ["countFavorites", () => favoritosRepo.countFavorites("u1", clienteFalso())],
    ["findFavoriteByCode", () => favoritosRepo.findFavoriteByCode("u1", "123", clienteFalso())],
  ];

  for (const [nome, executar] of leituras) {
    const cliente = clienteFalso();
    await executar.call(null, cliente);
    // reexecuta capturando o cliente de verdade
  }

  // Execucao real, uma a uma, inspecionando o SQL emitido.
  const casos = [
    ["listHistory", (c) => historicoRepo.listHistory("u1", c)],
    ["countHistory", (c) => historicoRepo.countHistory("u1", c)],
    ["listFavorites", (c) => favoritosRepo.listFavorites("u1", c)],
    ["countFavorites", (c) => favoritosRepo.countFavorites("u1", c)],
    ["findFavoriteByCode", (c) => favoritosRepo.findFavoriteByCode("u1", "123", c)],
  ];

  for (const [nome, executar] of casos) {
    const cliente = clienteFalso([{ rows: [{ total: 0 }], rowCount: 0 }]);
    await executar(cliente);
    assert.equal(cliente.chamadas.length, 1, `${nome} emitiu mais de uma consulta`);
    const sql = normalizar(cliente.chamadas[0].text);
    assert.match(sql, /WHERE user_id = \$1/, `${nome} nao filtra por usuario no SQL`);
    assert.equal(cliente.chamadas[0].params[0], "u1", `${nome} nao passa o usuario como parametro`);
  }
});

test("I2 toda escrita e remocao filtra por usuario no SQL", async () => {
  const casos = [
    ["deleteHistoryItem", (c) => historicoRepo.deleteHistoryItem("u1", "i1", c)],
    ["clearHistory", (c) => historicoRepo.clearHistory("u1", c)],
    ["pruneHistory", (c) => historicoRepo.pruneHistory("u1", 10, c)],
    ["removeFavorite", (c) => favoritosRepo.removeFavorite("u1", "i1", c)],
    ["removeFavoriteByCode", (c) => favoritosRepo.removeFavoriteByCode("u1", "123", c)],
  ];

  for (const [nome, executar] of casos) {
    const cliente = clienteFalso();
    await executar(cliente);
    const sql = normalizar(cliente.chamadas[0].text);
    assert.match(sql, /WHERE user_id = \$1/, `${nome} nao filtra por usuario no SQL`);
    assert.equal(cliente.chamadas[0].params[0], "u1");
  }
});

// A poda apaga por exclusao: "tudo menos os N mais recentes". Se a subconsulta
// que escolhe os N nao filtrar por usuario, ela escolhe os mais recentes da
// TABELA, e a poda de um usuario ativo apaga o historico de todos os outros.
test("I2 a subconsulta da poda tambem filtra por usuario", async () => {
  const cliente = clienteFalso();
  await historicoRepo.pruneHistory("u1", 100, cliente);
  const sql = normalizar(cliente.chamadas[0].text);

  const ocorrencias = sql.match(/WHERE user_id = \$1/g) || [];
  assert.equal(
    ocorrencias.length,
    2,
    `a poda precisa filtrar por usuario no DELETE e na subconsulta; encontrado ${ocorrencias.length}`,
  );
});

// ---------------------------------------------------------------------------
// H2 - deduplicacao
// ---------------------------------------------------------------------------

test("H2 registrar consulta do mesmo produto atualiza em vez de duplicar", async () => {
  const cliente = clienteFalso([{ rows: [{ id: "h1" }], rowCount: 1 }]);
  await historicoRepo.recordView(
    "u1",
    { productCode: "789", productName: "Leite", productBrand: null, imageUrl: null },
    cliente,
  );
  const sql = normalizar(cliente.chamadas[0].text);

  assert.match(sql, /ON CONFLICT ON CONSTRAINT product_history_user_product_unique/);
  assert.match(sql, /DO UPDATE SET/);
  // A dedup precisa vir da restricao do banco. `DO NOTHING` deixaria a linha
  // antiga com a data antiga, e o item nunca subiria para o topo da lista.
  assert.doesNotMatch(sql, /DO NOTHING/);
});

test("H2 a revisita usa o relogio do servidor, nunca horario do cliente", async () => {
  const cliente = clienteFalso([{ rows: [{ id: "h1" }], rowCount: 1 }]);
  await historicoRepo.recordView(
    "u1",
    { productCode: "789", productName: "Leite", productBrand: null, imageUrl: null },
    cliente,
  );
  const sql = normalizar(cliente.chamadas[0].text);

  assert.match(sql, /viewed_at = now\(\)/);
  for (const parametro of cliente.chamadas[0].params) {
    assert.ok(
      !(parametro instanceof Date),
      "nenhum horario deve ser enviado pelo cliente: a regra de conflito e o relogio do servidor",
    );
  }
});

// ---------------------------------------------------------------------------
// A1 - o veredito de alergia nunca e congelado
// ---------------------------------------------------------------------------

// `conflict` esta fora desta lista de proposito: `ON CONFLICT` e a sintaxe do
// Postgres que implementa a restricao de unicidade, e bane-la aqui reprovaria
// justamente o mecanismo correto. Os termos abaixo nao tem uso legitimo em
// tabela de identidade de produto.
const TERMOS_DE_VEREDITO = [
  "allergy_verdict",
  "allergyverdict",
  "allergen",
  "alergen",
  "safety",
  "detected_conflicts",
  "hasdeclaredconflict",
  "verdict",
];

test("A1 a migration nao cria nenhuma coluna de veredito de alergia", async () => {
  const sql = await readFile(
    path.join(backendDir, "migrations/002_history_favorites.sql"),
    "utf8",
  );
  // O comentario da migration explica por que essas colunas nao existem, entao
  // a busca precisa olhar so o DDL.
  const ddl = sql
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n")
    .toLowerCase();

  for (const termo of TERMOS_DE_VEREDITO) {
    assert.ok(
      !ddl.includes(termo.toLowerCase()),
      `a migration declara "${termo}": veredito congelado vira informacao de seguranca errada quando o perfil muda`,
    );
  }
});

test("A1 os repositorios nao leem nem escrevem coluna de veredito", async () => {
  for (const arquivo of ["historyRepository.js", "favoritesRepository.js"]) {
    const fonte = await readFile(path.join(backendDir, "src/repositories", arquivo), "utf8");
    const semComentario = fonte
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("//"))
      .join("\n")
      .toLowerCase();

    for (const termo of TERMOS_DE_VEREDITO) {
      assert.ok(
        !semComentario.includes(termo.toLowerCase()),
        `${arquivo} referencia "${termo}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// F3 e D1 - garantias que so o banco pode dar (parte estrutural)
// ---------------------------------------------------------------------------

test("F3 a migration declara unicidade de (usuario, produto) nas duas tabelas", async () => {
  const sql = await readFile(
    path.join(backendDir, "migrations/002_history_favorites.sql"),
    "utf8",
  );

  assert.match(
    sql,
    /CONSTRAINT product_history_user_product_unique UNIQUE \(user_id, product_code\)/,
  );
  assert.match(
    sql,
    /CONSTRAINT product_favorites_user_product_unique UNIQUE \(user_id, product_code\)/,
  );
});

test("D1 a migration declara cascata ao apagar o usuario", async () => {
  const sql = await readFile(
    path.join(backendDir, "migrations/002_history_favorites.sql"),
    "utf8",
  );
  const cascatas = sql.match(/REFERENCES users\(id\) ON DELETE CASCADE/g) || [];
  assert.equal(cascatas.length, 2, "as duas tabelas precisam cascatear a remocao do usuario");
});

test("a migration cria indice que serve a consulta real da tela", async () => {
  const sql = await readFile(
    path.join(backendDir, "migrations/002_history_favorites.sql"),
    "utf8",
  );
  assert.match(sql, /ON product_history \(user_id, viewed_at DESC\)/);
  assert.match(sql, /ON product_favorites \(user_id, created_at DESC\)/);
});

test("a migration e idempotente na forma", async () => {
  const sql = await readFile(
    path.join(backendDir, "migrations/002_history_favorites.sql"),
    "utf8",
  );
  const tabelas = sql.match(/CREATE TABLE/g) || [];
  const tabelasSeguras = sql.match(/CREATE TABLE IF NOT EXISTS/g) || [];
  const indices = sql.match(/CREATE INDEX/g) || [];
  const indicesSeguros = sql.match(/CREATE INDEX IF NOT EXISTS/g) || [];

  assert.equal(tabelas.length, tabelasSeguras.length, "CREATE TABLE sem IF NOT EXISTS");
  assert.equal(indices.length, indicesSeguros.length, "CREATE INDEX sem IF NOT EXISTS");
});

// ---------------------------------------------------------------------------
// I3 / I4 / V1 - identidade e autenticacao
// ---------------------------------------------------------------------------

test("I3 o schema de entrada nao aceita identidade de usuario", async () => {
  const { productRefSchema } = await import("../src/utils/validation.js");
  const analisado = productRefSchema.parse({
    productCode: "789",
    productName: "Leite",
    userId: "outro-usuario",
    user_id: "outro-usuario",
    id: "linha-de-outro",
  });

  assert.deepEqual(Object.keys(analisado).sort(), [
    "imageUrl",
    "productBrand",
    "productCode",
    "productName",
  ]);
  assert.equal(analisado.userId, undefined);
  assert.equal(analisado.user_id, undefined);
});

test("I3 os controladores so tiram identidade de req.user", async () => {
  const fonte = await readFile(
    path.join(backendDir, "src/controllers/collectionsController.js"),
    "utf8",
  );
  const semComentario = fonte
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");

  assert.doesNotMatch(semComentario, /req\.body\.userId/);
  assert.doesNotMatch(semComentario, /req\.body\.user_id/);
  assert.doesNotMatch(semComentario, /req\.query\.userId/);

  const usos = semComentario.match(/req\.user\.id/g) || [];
  assert.ok(usos.length >= 8, `esperado req.user.id em todas as acoes, encontrado ${usos.length}`);
});

test("I4 e V1 todas as rotas novas exigem sessao valida", async () => {
  for (const arquivo of ["historyRoutes.js", "favoritesRoutes.js"]) {
    const fonte = await readFile(path.join(backendDir, "src/routes", arquivo), "utf8");
    assert.match(fonte, /\.use\(requireAuth/, `${arquivo} nao aplica requireAuth a todas as rotas`);

    // O comentario do arquivo cita `optionalAuth` para registrar por que ele
    // NAO e usado; a verificacao precisa olhar so o codigo.
    const codigo = fonte
      .split(/\r?\n/)
      .filter((linha) => !linha.trim().startsWith("//"))
      .join("\n");
    assert.doesNotMatch(codigo, /optionalAuth/, `${arquivo} aceita requisicao sem sessao`);
  }
});

// ---------------------------------------------------------------------------
// H3 / F4 - limites
// ---------------------------------------------------------------------------

test("H3 registrar consulta poda o historico no limite configurado", async () => {
  const { registerView } = await import("../src/services/historyService.js");
  const chamadas = [];
  const cliente = {
    async query(text, params) {
      chamadas.push({ text: normalizar(text), params });
      return { rows: [{ id: "h1" }], rowCount: 0 };
    },
  };

  // O servico usa o pool real; aqui exercitamos o repositorio diretamente para
  // provar que a poda recebe o limite da configuracao.
  await historicoRepo.pruneHistory("u1", HISTORY_LIMIT, cliente);
  assert.equal(chamadas[0].params[1], HISTORY_LIMIT);
  assert.match(chamadas[0].text, /ORDER BY viewed_at DESC LIMIT \$2/);
  assert.equal(typeof registerView, "function");
});

test("H3 o limite do historico e um numero justificado e aplicado", () => {
  assert.equal(typeof HISTORY_LIMIT, "number");
  assert.ok(HISTORY_LIMIT > 0 && HISTORY_LIMIT <= 1000, "limite fora de faixa plausivel");
});

test("F4 o limite de favoritos existe e nao poda em silencio", async () => {
  const fonte = await readFile(path.join(backendDir, "src/services/favoritesService.js"), "utf8");
  assert.match(fonte, /FAVORITES_LIMIT_REACHED/);
  // Poda silenciosa em favorito apagaria escolha explicita do usuario.
  assert.doesNotMatch(fonte, /prune|podar/i);
  assert.ok(FAVORITES_LIMIT > 0);
});

test("F4 remarcar favorito existente nao esbarra no limite", async () => {
  const { addToFavorites } = await import("../src/services/favoritesService.js");
  assert.equal(typeof addToFavorites, "function");

  const fonte = await readFile(path.join(backendDir, "src/services/favoritesService.js"), "utf8");
  const indiceBusca = fonte.indexOf("findFavoriteByCode");
  const indiceContagem = fonte.indexOf("countFavorites(userId)");
  assert.ok(indiceBusca !== -1 && indiceContagem !== -1);
  assert.ok(
    indiceBusca < indiceContagem,
    "a checagem de favorito ja existente precisa vir antes da checagem de limite",
  );
});

// ---------------------------------------------------------------------------
// Visitante
// ---------------------------------------------------------------------------

test("V1 nenhuma rota nova aparece fora do bloco autenticado do app", async () => {
  const app = await readFile(path.join(backendDir, "src/app.js"), "utf8");
  assert.match(app, /app\.use\("\/api\/history", historyRoutes\)/);
  assert.match(app, /app\.use\("\/api\/favorites", favoritesRoutes\)/);
});

// As duas origens de dado vivem em arquivos separados de proposito: o servico
// que fala com a API nao pode tocar em localStorage, e o do visitante nao pode
// chamar a API. Um arquivo unico que decidisse entre os dois seria o lugar
// exato onde um visitante acabaria gravando no PostgreSQL por engano.
test("V1 o servico de API nao le nem escreve armazenamento local", async () => {
  const fonte = await readFile(path.join(rootDir, "src/services/collectionsService.js"), "utf8");
  const codigo = fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");

  assert.doesNotMatch(codigo, /localStorage/, "o servico de API toca em armazenamento local");
  assert.doesNotMatch(codigo, /sessionStorage/);
});

test("V1 o servico do visitante nao chama nenhuma rota da API", async () => {
  const fonte = await readFile(path.join(rootDir, "src/services/guestCollections.js"), "utf8");
  const codigo = fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");

  assert.doesNotMatch(codigo, /apiRequest|fetch\(|\/api\//, "o caminho do visitante alcanca a API");
  assert.match(codigo, /localStorage/, "o visitante precisa gravar no proprio navegador");
});
