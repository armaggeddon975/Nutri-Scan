import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import pg from "pg";

import { createApp } from "../src/app.js";
import { COMPARISON_SYSTEM_PROMPT } from "../src/ai/comparisonPrompt.js";
import {
  JANELA_COMPARACAO_MS,
  TETO_COMPARACAO_POR_IP,
  TETO_COMPARACAO_POR_USUARIO,
  criarLimitadoresDeComparacao,
} from "../src/middleware/rateLimit.js";
import { amarrarExplicacoes, compararProdutos, explicarComparacao } from "../src/services/comparisonService.js";
import { compararVersoes } from "../../scripts/version-check.js";
import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";
import { analyzeComparedProduct, compareProducts } from "../../shared/productComparison.js";
import {
  CODIGOS_IGUAIS,
  CODIGO_INVALIDO,
  DOIS_ENCONTRADOS,
  ENCONTRADO,
  ERRO_DE_REDE,
  INCOMPLETO,
  NAO_ENCONTRADO,
  ORIGEM_CAMERA,
  ORIGEM_MANUAL,
  consultarDoisProdutos,
} from "../../src/services/productLookup.js";

// v0.10.0 - comparacao de dois produtos, sem banco.
//
// Nenhum teste daqui chama o modelo de verdade: a explicacao usa um cliente
// simulado, e a rota HTTP de explicacao so e chamada com corpo invalido (que e
// recusado antes de qualquer chamada). O `.env` desta maquina tem chave real.

const rootDir = path.resolve(import.meta.dirname, "..", "..");

// Codigos com digito verificador correto.
const COD_LEITE = "7891000100103";
const COD_ARROZ = "0036000291452";
const COD_ARROZ_UPCA = "036000291452";
const COD_PACOCA = "5449000000996";

const LEITE = {
  product_name: "Leite em po",
  brands: "Marca L",
  ingredients_text: "leite em po integral",
  nutriments: { "sugars_100g": 38, "sodium_100g": 0.4 },
};
const ARROZ = {
  product_name: "Biscoito de arroz",
  ingredients_text: "farinha de arroz, sal",
  nutriments: { "sugars_100g": 0 },
};
const PACOCA = { product_name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };
const TRACO_AMENDOIM = { product_name: "Bolacha", ingredients_text: "farinha de arroz, sal", traces: ["peanuts"] };
const SEM_DADO = { product_name: "Produto sem rotulo" };

const VISITANTE = { user: null };

function corpo(a, b, guestAllergies = ["milk"]) {
  return { products: [a, b], guestAllergies, userId: "outra-pessoa", user_id: "outra-pessoa" };
}

// Titular "autenticado" com perfil injetado - os carregadores do PostgreSQL,
// trocados por teste. O id que chega aos carregadores e conferido.
function titular(alergias, niveis = {}) {
  const vistos = [];
  return {
    req: { user: { id: "titular-da-sessao" } },
    vistos,
    options: {
      loadUserAllergies: async (id) => {
        vistos.push(id);
        return alergias;
      },
      loadUserAlertLevels: async (id) => {
        vistos.push(id);
        return niveis;
      },
      logger: { warn: () => {} },
    },
  };
}

// Modelo simulado. `explicacoes` e exatamente o que ele devolve.
function modelo(explicacoes, extra = {}, chamadas = []) {
  return {
    messages: {
      create: async (pedido) => {
        chamadas.push(pedido);
        return {
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({ explanations: explicacoes, category: "allergy", usedProductContext: true, ...extra }),
            },
          ],
        };
      },
    },
  };
}

const explicacao = (codigo, text, safety = "normal") => ({ productCode: codigo, text, safety });

function porSlot(resposta) {
  return Object.fromEntries(resposta.comparison.products.map((produto) => [produto.slot, produto]));
}

// O veredito de UM produto, calculado sozinho, com o mesmo perfil.
function vereditoSozinho(produto, perfil) {
  return analyzeComparedProduct(produto, perfil).allergyVerdict;
}

// ---------------------------------------------------------------------------
// C1t a C4t - um veredito por produto, sem contaminacao
// ---------------------------------------------------------------------------

test("C1t cada produto recebe veredito proprio, calculado independentemente", () => {
  const perfil = { profileAllergies: ["milk", "peanut"], alertLevels: { peanut: "strict" } };
  const pares = [
    [LEITE, ARROZ],
    [ARROZ, LEITE],
    [PACOCA, LEITE],
    [SEM_DADO, PACOCA],
    [TRACO_AMENDOIM, LEITE],
  ];
  for (const [a, b] of pares) {
    const comparacao = compareProducts([{ code: "1", product: a }, { code: "2", product: b }], perfil);
    // Cada veredito e IDENTICO ao do produto calculado sozinho.
    assert.deepEqual(comparacao.products[0].allergyVerdict, vereditoSozinho(a, perfil));
    assert.deepEqual(comparacao.products[1].allergyVerdict, vereditoSozinho(b, perfil));
    // E nao e o mesmo objeto do outro lado.
    assert.notEqual(comparacao.products[0].allergyVerdict, comparacao.products[1].allergyVerdict);
    assert.equal("verdict" in comparacao, false, "existe veredito 'da comparacao'");
    assert.equal("allergyVerdict" in comparacao, false, "existe veredito 'da comparacao'");
  }
});

test("C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado", async () => {
  for (const ordem of [
    [{ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }],
    [{ code: COD_ARROZ, product: ARROZ }, { code: COD_LEITE, product: LEITE }],
  ]) {
    const deterministico = porSlot(await compararProdutos(VISITANTE, corpo(...ordem)));
    const comModelo = porSlot(
      await explicarComparacao(
        VISITANTE,
        corpo(...ordem),
        modelo([explicacao(COD_LEITE, "sobre o leite"), explicacao(COD_ARROZ, "sobre o arroz")]),
        { logger: { warn: () => {} } },
      ),
    );
    for (const resposta of [deterministico, comModelo]) {
      const leite = Object.values(resposta).find((produto) => produto.code === COD_LEITE);
      const arroz = Object.values(resposta).find((produto) => produto.code === COD_ARROZ);
      assert.equal(leite.allergyVerdict.status, "conflict");
      assert.equal(leite.safety, "caution", "o produto em conflito foi rebaixado");
      assert.equal(arroz.allergyVerdict.status, "clear");
      assert.equal(arroz.allergyVerdict.minimumSafety, null);
      assert.equal(arroz.safety, "normal", "o produto limpo herdou o safety do outro");
      assert.equal(arroz.allergyVerdict.safetyFloorApplied, false);
    }
  }
});

test("C3t alerta maximo: o piso urgent vai ao produto certo, e so a ele", async () => {
  const { req, options } = titular(["milk", "peanut"], { peanut: "strict", milk: "standard" });
  const resposta = porSlot(
    await explicarComparacao(
      req,
      corpo({ code: COD_PACOCA, product: PACOCA }, { code: COD_LEITE, product: LEITE }),
      modelo([explicacao(COD_LEITE, "x"), explicacao(COD_PACOCA, "y")]),
      options,
    ),
  );
  assert.equal(resposta.a.allergyVerdict.minimumSafety, "urgent");
  assert.equal(resposta.a.safety, "urgent");
  assert.equal(resposta.b.allergyVerdict.minimumSafety, "caution", "o leite padrao virou urgent pelo amendoim do vizinho");
  assert.equal(resposta.b.safety, "caution");
});

test("C4t traco em um, declarado no outro: cada veredito com a sua origem", async () => {
  const { req, options } = titular(["peanut"], { peanut: "strict" });
  const estrito = porSlot(
    await compararProdutos(req, corpo({ code: COD_LEITE, product: TRACO_AMENDOIM }, { code: COD_PACOCA, product: PACOCA }), options),
  );
  assert.deepEqual(estrito.a.allergyVerdict.conflicts, [{ id: "peanut", label: "Amendoim", origin: "traces", alertLevel: "strict" }]);
  assert.equal(estrito.a.safety, "caution");
  assert.deepEqual(estrito.b.allergyVerdict.conflicts, [{ id: "peanut", label: "Amendoim", origin: "declared", alertLevel: "strict" }]);
  assert.equal(estrito.b.safety, "urgent");

  const padrao = porSlot(
    await compararProdutos(VISITANTE, corpo({ code: COD_LEITE, product: TRACO_AMENDOIM }, { code: COD_PACOCA, product: PACOCA }, ["peanut"])),
  );
  assert.equal(padrao.a.allergyVerdict.status, "traces");
  assert.equal(padrao.a.safety, "normal");
  assert.equal(padrao.b.allergyVerdict.status, "conflict");
  assert.equal(padrao.b.safety, "caution");
});

// ---------------------------------------------------------------------------
// C5t a C7t - o modelo nao amarra, nao rebaixa e nao escreve veredito
// ---------------------------------------------------------------------------

test("C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo", async () => {
  const resposta = porSlot(
    await explicarComparacao(
      VISITANTE,
      corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }),
      // O modelo devolveu o ARROZ primeiro.
      modelo([explicacao(COD_ARROZ, "TEXTO-DO-ARROZ"), explicacao(COD_LEITE, "TEXTO-DO-LEITE")]),
      { logger: { warn: () => {} } },
    ),
  );
  assert.equal(resposta.a.code, COD_LEITE);
  assert.equal(resposta.a.explanation, "TEXTO-DO-LEITE");
  assert.equal(resposta.b.explanation, "TEXTO-DO-ARROZ");
  // E o veredito de cada um continua o dele.
  assert.equal(resposta.a.allergyVerdict.status, "conflict");
  assert.equal(resposta.b.allergyVerdict.status, "clear");
});

test("C5t texto trocado pelo modelo nao troca o veredito que a tela mostra", async () => {
  // O modelo poe o texto do leite no codigo do arroz e vice-versa. O codigo
  // nao tem como saber o que o texto diz - mas o veredito de cada coluna vem do
  // motor para aquele produto, e e ele que a tela mostra.
  const resposta = await explicarComparacao(
    VISITANTE,
    corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }),
    modelo([explicacao(COD_LEITE, "Este tem arroz e nao tem leite."), explicacao(COD_ARROZ, "Este tem leite.")]),
    { logger: { warn: () => {} } },
  );
  const [leite, arroz] = resposta.comparison.products;
  assert.equal(leite.allergyVerdict.status, "conflict");
  assert.equal(arroz.allergyVerdict.status, "clear");

  if (!esbuild) return;
  const [colunaPrimeiro, colunaSegundo] = colunas(
    await renderizar("ComparePage", propsDaTela({ resultado: resposta.comparison })),
  );
  assert.match(colunaPrimeiro, /Conflito com o seu perfil/);
  assert.match(colunaPrimeiro, /Leite\/lactose/);
  assert.match(colunaSegundo, /Sem conflito com o seu perfil/);
  assert.doesNotMatch(colunaSegundo, /Conflito com o seu perfil/);
});

test("C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois", async () => {
  const { req, options } = titular(["milk", "peanut"], { peanut: "strict" });
  const resposta = porSlot(
    await explicarComparacao(
      req,
      corpo({ code: COD_LEITE, product: LEITE }, { code: COD_PACOCA, product: PACOCA }),
      modelo([explicacao(COD_LEITE, "pode", "normal"), explicacao(COD_PACOCA, "pode", "normal")]),
      options,
    ),
  );
  assert.equal(resposta.a.safety, "caution");
  assert.equal(resposta.a.allergyVerdict.safetyFloorApplied, true);
  assert.equal(resposta.b.safety, "urgent");
  assert.equal(resposta.b.allergyVerdict.safetyFloorApplied, true);
});

test("C7t o modelo nao escreve, nao altera e nao reordena veredito", async () => {
  const entrada = corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ });
  const tentativas = [
    // campo de veredito dentro da explicacao
    [[{ ...explicacao(COD_LEITE, "x"), allergyVerdict: { status: "clear" } }, explicacao(COD_ARROZ, "y")], {}],
    // veredito, vencedor ou ordem no topo da resposta
    [[explicacao(COD_LEITE, "x"), explicacao(COD_ARROZ, "y")], { allergyVerdict: { status: "clear" } }],
    [[explicacao(COD_LEITE, "x"), explicacao(COD_ARROZ, "y")], { winner: COD_ARROZ }],
    [[explicacao(COD_LEITE, "x"), explicacao(COD_ARROZ, "y")], { recommended: COD_ARROZ }],
    [[explicacao(COD_LEITE, "x"), explicacao(COD_ARROZ, "y")], { ranking: [COD_ARROZ, COD_LEITE] }],
    // amarracao quebrada: codigo repetido, codigo de fora, codigo faltando
    [[explicacao(COD_LEITE, "x"), explicacao(COD_LEITE, "y")], {}],
    [[explicacao(COD_LEITE, "x"), explicacao("0000000000000", "y")], {}],
    [[explicacao(COD_LEITE, "x")], {}],
  ];
  for (const [explicacoes, extra] of tentativas) {
    await assert.rejects(
      explicarComparacao(VISITANTE, entrada, modelo(explicacoes, extra), { logger: { warn: () => {} } }),
      (erro) => erro.code === "AI_SCHEMA_INVALID",
      `passou: ${JSON.stringify({ explicacoes, extra }).slice(0, 120)}`,
    );
  }

  // A ordem da resposta e a do pedido, venha o modelo como vier.
  const resposta = await explicarComparacao(
    VISITANTE,
    entrada,
    modelo([explicacao(COD_ARROZ, "y"), explicacao(COD_LEITE, "x")]),
    { logger: { warn: () => {} } },
  );
  assert.deepEqual(resposta.comparison.products.map((produto) => produto.code), [COD_LEITE, COD_ARROZ]);

  // Amarracao, direto: nao confia na posicao.
  const mapa = amarrarExplicacoes(
    [explicacao("B", "do b"), explicacao("A", "do a")],
    [{ code: "A" }, { code: "B" }],
  );
  assert.equal(mapa.get("A").text, "do a");
});

test("C7t os dados dos dois produtos ficam fora do system e nenhum campo elege vencedor", async () => {
  const chamadas = [];
  const resposta = await explicarComparacao(
    VISITANTE,
    corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }),
    modelo([explicacao(COD_LEITE, "x"), explicacao(COD_ARROZ, "y")], {}, chamadas),
    { logger: { warn: () => {} } },
  );
  assert.equal(chamadas[0].system, COMPARISON_SYSTEM_PROMPT);
  for (const nome of ["Leite em po", "Biscoito de arroz", "Marca L", "farinha de arroz"]) {
    assert.equal(chamadas[0].system.includes(nome), false, `${nome} no system`);
    assert.ok(JSON.stringify(chamadas[0].messages).includes(nome), `${nome} fora do bloco de dados`);
  }
  // Nivel de alerta continua fora do que vai ao modelo.
  assert.equal(JSON.stringify(chamadas[0]).includes("alertLevel"), false);

  const proibido = /winner|best|recommend|ranking|score|melhor|vencedor|recomendad/i;
  const chaves = [
    ...Object.keys(resposta),
    ...Object.keys(resposta.comparison),
    ...resposta.comparison.products.flatMap((produto) => Object.keys(produto)),
  ];
  for (const chave of chaves) assert.doesNotMatch(chave, proibido, `campo que elege vencedor: ${chave}`);
});

// ---------------------------------------------------------------------------
// C8t - ausencia nao vira "nao contem"
// ---------------------------------------------------------------------------

test("C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum", async () => {
  const resposta = await compararProdutos(
    VISITANTE,
    corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: SEM_DADO }),
  );
  const [comDado, semDado] = resposta.comparison.products;

  assert.equal(comDado.allergenData, "informed");
  assert.equal(semDado.allergenData, "not_informed");
  assert.deepEqual(semDado.allergens, []);
  assert.equal(semDado.allergyVerdict.status, "not_evaluated", "sem dado virou 'sem conflito'");
  assert.equal(semDado.allergyVerdict.reason, "no_allergen_data");
  assert.equal(semDado.allergyVerdict.alert, "");

  // Nas diferencas, o lado sem dado e "not_informed" - nunca "not_detected".
  assert.ok(resposta.comparison.differences.allergens.length > 0);
  for (const linha of resposta.comparison.differences.allergens) {
    assert.equal(linha.b, "not_informed", `${linha.id}: o lado sem dado virou ${linha.b}`);
  }
  // Nutriente ausente e null, nunca 0. O 0 declarado continua 0.
  for (const linha of semDado.nutrition) assert.equal(linha.value, null, `${linha.key} virou ${linha.value}`);
  const acucar = resposta.comparison.differences.nutrition.find((linha) => linha.key === "sugars");
  assert.equal(acucar.b, null);
  const zero = (await compararProdutos(VISITANTE, corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ })))
    .comparison.products[1].nutrition.find((linha) => linha.key === "sugars");
  assert.equal(zero.value, 0, "o zero declarado sumiu");
  // Fibra que nao existe em nenhum dos dois nao aparece como diferenca.
  assert.equal(resposta.comparison.differences.nutrition.some((linha) => linha.key === "fiber"), false);

  if (!esbuild) return;
  const bruto = await renderizar("ComparePage", propsDaTela({ resultado: resposta.comparison }));
  const html = textoVisivel(bruto);
  const [, colunaSegundo] = colunas(bruto);
  assert.match(colunaSegundo, /Sem dados de alergênicos/);
  assert.doesNotMatch(colunaSegundo, /Sem conflito/);
  const tabela = html.slice(html.indexOf("Diferenças"));
  assert.match(tabela, /Leite\/lactose Tem Não informado/);
  assert.doesNotMatch(tabela, /Leite\/lactose Tem Não aparece no rótulo/);
  assert.match(tabela, /Açúcares 38 g Não informado/);
});

// ---------------------------------------------------------------------------
// C9t a C12 - os codigos e o que falta
// ---------------------------------------------------------------------------

function buscaFalsa(porCodigo) {
  const chamadas = [];
  return {
    chamadas,
    buscar: async (codigo) => {
      chamadas.push(codigo);
      const valor = porCodigo[codigo];
      if (valor instanceof Error) throw valor;
      return valor ?? null;
    },
  };
}

test("C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca", async () => {
  for (const [a, b] of [
    ["7891000100104", COD_ARROZ],
    [COD_LEITE, "0036000291453"],
    ["7891000100104", "0036000291453"],
  ]) {
    const falsa = buscaFalsa({ [COD_LEITE]: LEITE, [COD_ARROZ]: ARROZ });
    const resultado = await consultarDoisProdutos({ entrada: a }, { entrada: b }, { buscar: falsa.buscar });
    assert.equal(resultado.estado, CODIGO_INVALIDO);
    assert.deepEqual(falsa.chamadas, [], `buscou ${falsa.chamadas.join(",")} com um codigo invalido`);
  }
  assert.throws(() => compareRequestValidation({ code: "7891000100104", product: LEITE }, { code: COD_ARROZ, product: ARROZ }));
});

test("C10 UPC-A em um e EAN-13 no outro: os dois canonicalizados", async () => {
  const falsa = buscaFalsa({ [COD_ARROZ]: ARROZ, [COD_LEITE]: LEITE });
  const resultado = await consultarDoisProdutos({ entrada: COD_ARROZ_UPCA }, { entrada: COD_LEITE }, { buscar: falsa.buscar });
  assert.equal(resultado.estado, DOIS_ENCONTRADOS);
  assert.deepEqual(falsa.chamadas.sort(), [COD_ARROZ, COD_LEITE].sort(), "a busca nao usou a forma canonica");

  const resposta = await compararProdutos(VISITANTE, corpo({ code: COD_ARROZ_UPCA, product: ARROZ }, { code: COD_LEITE, product: LEITE }));
  assert.deepEqual(resposta.comparison.products.map((produto) => produto.code), [COD_ARROZ, COD_LEITE]);
});

test("C11 codigos iguais: recusados com mensagem clara, sem busca", async () => {
  const falsa = buscaFalsa({ [COD_ARROZ]: ARROZ });
  for (const [a, b, origemB] of [
    [COD_ARROZ, COD_ARROZ, ORIGEM_MANUAL],
    [COD_ARROZ_UPCA, COD_ARROZ, ORIGEM_MANUAL],
    [COD_ARROZ, COD_ARROZ_UPCA, ORIGEM_CAMERA],
  ]) {
    const resultado = await consultarDoisProdutos({ entrada: a }, { entrada: b, origem: origemB }, { buscar: falsa.buscar });
    assert.equal(resultado.estado, CODIGOS_IGUAIS, `${a} x ${b}`);
  }
  assert.deepEqual(falsa.chamadas, []);
  assert.throws(
    () => compareRequestValidation({ code: COD_ARROZ_UPCA, product: ARROZ }, { code: COD_ARROZ, product: ARROZ }),
    (erro) => erro.issues.some((i) => i.message === "Esses dois códigos são do mesmo produto. Escolha outro para comparar."),
  );
});

test("C12 um produto nao encontrado: o que veio aparece, o que faltou e dito, e a API recusa par incompleto", async () => {
  const naoAchou = await consultarDoisProdutos(
    { entrada: COD_LEITE },
    { entrada: COD_ARROZ },
    { buscar: buscaFalsa({ [COD_LEITE]: LEITE }).buscar },
  );
  assert.equal(naoAchou.estado, INCOMPLETO);
  assert.equal(naoAchou.a.estado, ENCONTRADO);
  assert.equal(naoAchou.b.estado, NAO_ENCONTRADO);

  const semRede = await consultarDoisProdutos(
    { entrada: COD_LEITE },
    { entrada: COD_ARROZ },
    { buscar: buscaFalsa({ [COD_LEITE]: LEITE, [COD_ARROZ]: new Error("rede") }).buscar },
  );
  assert.equal(semRede.estado, INCOMPLETO);
  assert.equal(semRede.b.estado, ERRO_DE_REDE);

  assert.throws(
    () => compareRequestValidation({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: null }),
    (erro) => erro.issues.some((i) => i.message === "A comparação precisa dos dois produtos encontrados."),
  );

  if (!esbuild) return;
  const html = textoVisivel(
    await renderizar(
      "ComparePage",
      propsDaTela({
        parcial: {
          a: { produto: { slot: "a", code: COD_LEITE, ...analyzeComparedProduct(LEITE, { profileAllergies: ["milk"] }) } },
          b: { consulta: { estado: NAO_ENCONTRADO, codigo: COD_ARROZ } },
        },
      }),
    ),
  );
  assert.match(html, /Leite em po/);
  assert.match(html, /Não encontrei o produto 0036000291452 na Open Food Facts\./);
  assert.doesNotMatch(html, /Diferenças/, "comparou diferencas sem o segundo produto");
});

// ---------------------------------------------------------------------------
// C13 a C16 - perfil, visitante, limitador, busca
// ---------------------------------------------------------------------------

import { validateComparison } from "../src/utils/validation.js";

function compareRequestValidation(a, b) {
  return validateComparison({ products: [a, b] });
}

test("C13 nenhum campo da requisicao escolhe de quem e o perfil", async () => {
  const { req, options, vistos } = titular(["milk"]);
  const resposta = await compararProdutos(
    req,
    { ...corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }, ["peanut"]), userId: "x", user: { id: "x" } },
    options,
  );
  assert.deepEqual([...new Set(vistos)], ["titular-da-sessao"], "o perfil foi lido de outro usuario");
  assert.equal(resposta.comparison.profileSource, "postgresql");
  // Com sessao, guestAllergies do corpo nao vale: o leite e conflito pelo perfil.
  assert.equal(resposta.comparison.products[0].allergyVerdict.status, "conflict");
  assert.equal(validateComparison({ products: [{ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }], userId: "x" }).userId, undefined);
});

async function comServidor(callback) {
  const server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("C14 visitante usa o perfil do request e nao toca o banco", async () => {
  const consultas = [];
  const original = { query: pg.Pool.prototype.query, connect: pg.Pool.prototype.connect };
  pg.Pool.prototype.query = function (...args) {
    consultas.push(String(args[0]).slice(0, 40));
    return original.query.apply(this, args);
  };
  pg.Pool.prototype.connect = function (...args) {
    consultas.push("connect");
    return original.connect.apply(this, args);
  };
  try {
    await comServidor(async (base) => {
      const resposta = await fetch(`${base}/api/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }, ["milk"])),
      });
      const json = await resposta.json();
      assert.equal(resposta.status, 200);
      assert.equal(json.comparison.profileSource, "request");
      assert.equal(json.comparison.products[0].allergyVerdict.status, "conflict");
    });
  } finally {
    pg.Pool.prototype.query = original.query;
    pg.Pool.prototype.connect = original.connect;
  }
  assert.deepEqual(consultas, [], `o visitante tocou o banco: ${consultas.join(" | ")}`);
});

test("C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente", async () => {
  assert.equal(TETO_COMPARACAO_POR_USUARIO, 30);
  assert.equal(TETO_COMPARACAO_POR_IP, 300);
  assert.equal(JANELA_COMPARACAO_MS, 10 * 60 * 1000);

  const rotas = readFileSync(path.join(rootDir, "backend/src/routes/compareRoutes.js"), "utf8");
  assert.match(rotas, /compareRoutes\.post\("\/", optionalAuth, compareRateLimit, comparar\)/);
  assert.match(rotas, /compareRoutes\.post\("\/explain", optionalAuth, compareRateLimit, assistantRateLimit, explicar\)/);
  assert.doesNotMatch(rotas, /skip|bypass/i);

  // Fabrica com os numeros de producao: a 31a do mesmo visitante e recusada.
  const express = (await import("express")).default;
  const app = express();
  app.post("/x", ...criarLimitadoresDeComparacao(), (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    let status;
    for (let i = 1; i <= TETO_COMPARACAO_POR_USUARIO + 1; i += 1) status = (await fetch(`${base}/x`, { method: "POST" })).status;
    assert.equal(status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // Nas rotas reais: o ultimo limitador de cada uma e quem escreve o cabecalho.
  // A explicacao vai com corpo INVALIDO - recusada antes de qualquer chamada ao
  // modelo -, so para ler o cabecalho.
  await comServidor(async (base) => {
    const comparacao = await fetch(`${base}/api/compare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(comparacao.status, 400);
    assert.equal(comparacao.headers.get("ratelimit-limit"), String(TETO_COMPARACAO_POR_IP));
    const explicar = await fetch(`${base}/api/compare/explain`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(explicar.status, 400);
    assert.equal(explicar.headers.get("ratelimit-limit"), "20", "a explicacao nao passa pelo balde do assistente");
  });
});

test("C16 as duas buscas usam o openFoodFactsService, sem segundo cliente", async () => {
  const lookup = readFileSync(path.join(rootDir, "src/services/productLookup.js"), "utf8");
  assert.match(lookup, /import \{ fetchProductByBarcode \} from "\.\/openFoodFactsService\.js";/);
  assert.match(lookup, /export async function consultarDoisProdutos\(primeiro, segundo, \{ buscar = fetchProductByBarcode \} = \{\}\)/);

  // Nenhum outro arquivo do app ou do backend fala com a Open Food Facts.
  const arquivos = [];
  const varrer = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = path.join(dir, nome);
      if (statSync(caminho).isDirectory()) varrer(caminho);
      else if (/\.(js|jsx)$/.test(nome)) arquivos.push(caminho);
    }
  };
  for (const dir of ["src", "backend/src", "shared"]) varrer(path.join(rootDir, dir));
  // "Cliente" e quem cita a OFF E faz requisicao. O `app.js` cita a OFF so na
  // CSP, para liberar a chamada do navegador e as imagens - nao requisita nada.
  const clientes = arquivos.filter((arquivo) => {
    const codigo = readFileSync(arquivo, "utf8");
    return /openfoodfacts\.(org|net)/i.test(codigo) && /\bfetch\w*\(|doFetch\(|axios|https?\.(get|request)\(/.test(codigo);
  });
  assert.deepEqual(
    clientes.map((arquivo) => path.relative(rootDir, arquivo).replace(/\\/g, "/")),
    ["src/services/openFoodFactsService.js"],
  );

  // As duas buscas: exatamente duas chamadas, uma por codigo.
  const falsa = buscaFalsa({ [COD_LEITE]: LEITE, [COD_ARROZ]: ARROZ });
  await consultarDoisProdutos({ entrada: COD_LEITE }, { entrada: COD_ARROZ }, { buscar: falsa.buscar });
  assert.deepEqual(falsa.chamadas.sort(), [COD_ARROZ, COD_LEITE].sort());
});

// ---------------------------------------------------------------------------
// A4 - 0.10.0 vem depois de 0.9.0: nenhuma comparacao de versao por ordem
// ---------------------------------------------------------------------------

test("A4 nenhuma comparacao de versao do projeto depende de ordem, so de igualdade", () => {
  assert.equal(compararVersoes("0.10.0", "0.10.0").ok, true);
  assert.equal(compararVersoes("0.10.0", "0.9.0").ok, false);
  assert.equal(compararVersoes("0.9.0", "0.10.0").ok, false);
  // Em texto, "0.10.0" < "0.9.0"; nenhum codigo do projeto pode depender disso.
  assert.equal("0.10.0" < "0.9.0", true);

  const fontes = ["scripts", "scripts/lib", "backend/src", "backend/scripts", "src", "shared"].flatMap((dir) =>
    readdirSync(path.join(rootDir, dir))
      .filter((nome) => /\.(js|jsx)$/.test(nome))
      .map((nome) => [path.join(dir, nome), readFileSync(path.join(rootDir, dir, nome), "utf8")]),
  );
  for (const [arquivo, codigo] of fontes) {
    assert.doesNotMatch(codigo, /version\w*\s*[<>]=?\s*\w|[<>]=?\s*\w*\.version\b|localeCompare\([^)]*version/i, `${arquivo} ordena versao`);
  }
});

// ---------------------------------------------------------------------------
// A tela - renderizada de verdade
// ---------------------------------------------------------------------------

async function carregarEsbuild() {
  try {
    const modulo = await import("esbuild");
    await import("react");
    await import("react-dom/server");
    return modulo;
  } catch {
    return null;
  }
}
const esbuild = await carregarEsbuild();
const semEsbuild = esbuild ? false : "NAO EXECUTADO - esbuild/react ausentes: instale as dependencias do package raiz";

async function renderizar(nome, props) {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { ComparePage } from "./src/pages/Compare/ComparePage.jsx";
        const componentes = { ComparePage };
        export function render(nome, props) {
          return renderToStaticMarkup(React.createElement(componentes[nome], props));
        }
      `,
      resolveDir: rootDir,
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-comparacao-"));
  const arquivo = path.join(dir, "render.mjs");
  try {
    writeFileSync(arquivo, bundle.outputFiles[0].text, "utf8");
    return (await import(pathToFileURL(arquivo).href)).render(nome, props);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// As colunas da tela, uma por <article>, como texto.
function colunas(html) {
  return html
    .split("<article")
    .slice(1)
    .map((parte) => textoVisivel(parte.slice(parte.indexOf(">") + 1, parte.indexOf("</article>"))));
}

const textoVisivel = (html) =>
  html.replace(/<\/(td|th)>/g, " ").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");

function propsDaTela({ resultado = null, parcial = null } = {}) {
  return {
    comparacao: {
      entradaA: COD_LEITE,
      entradaB: COD_ARROZ,
      carregando: false,
      mensagem: null,
      resultado,
      parcial,
      explicando: false,
    },
    opcoesMeusProdutos: [],
    onChangeEntrada: () => {},
    onEscolher: () => {},
    onEscanear: () => {},
    onComparar: () => {},
    onExplicar: () => {},
    onAbrirProduto: () => {},
  };
}

const VOCABULARIO_PROIBIDO = /melhor|recomend|vencedor|mais seguro|mais saud|escolha segura|deve comer|evite|procure|atendimento|m[eé]dic|diagn/i;

test("a tela mostra os dois sem eleger vencedor e sem orientacao", { skip: semEsbuild }, async () => {
  const resposta = await compararProdutos(VISITANTE, corpo({ code: COD_LEITE, product: LEITE }, { code: COD_ARROZ, product: ARROZ }));
  const html = await renderizar("ComparePage", propsDaTela({ resultado: resposta.comparison }));
  const texto = textoVisivel(html);
  const [primeiro, segundo] = colunas(html);
  assert.match(primeiro, /^ ?Primeiro Leite em po/);
  assert.match(segundo, /^ ?Segundo Biscoito de arroz/);
  assert.match(texto, /A escolha é sua\./);
  assert.doesNotMatch(texto, VOCABULARIO_PROIBIDO, "a tela elege vencedor ou orienta");
  // As duas colunas com a mesma classe: nenhum lado em destaque.
  const classes = [...html.matchAll(/<article class="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(classes, ["compare-col", "compare-col"]);
});
