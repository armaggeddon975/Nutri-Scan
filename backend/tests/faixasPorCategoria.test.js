import assert from "node:assert/strict";
import { test } from "node:test";

import { FAIXAS_TACO, FONTE_DAS_FAIXAS } from "../../src/data/faixasTaco.js";
import { LOCAL_FOODS } from "../../src/data/foods.js";
import { reduzirProduto } from "../../src/services/offlineCache.js";
import { avaliarTabelaNutricional, CONFIANCA } from "../../src/utils/confiancaDaTabela.js";
import { conferirFaixaDoTipo, tipoDoProduto } from "../../src/utils/faixasPorCategoria.js";
import { toLocalProduct } from "../../src/utils/product.js";

// FAIXAS POR TIPO DE PRODUTO, PELA TACO (06/11/2026)
//
// Os casos reais vem da Open Food Facts lida em 06/11/2026: numeros por 100 g e
// categorias copiados aqui, sem rede. "Foto" quer dizer que o erro foi
// conferido contra a foto do rotulo (medicao/tabelas-com-foto.json, leitura
// feita por Claude, com o endereco de cada foto para conferencia humana).

function off(codigo, nutrientes, categorias) {
  const nutriments = Object.fromEntries(Object.entries(nutrientes).map(([chave, valor]) => [`${chave}_100g`, valor]));
  return { code: codigo, categories_tags: categorias, nutriments: { ...nutriments, sodium_unit: "g" } };
}

const ACHOCOLATADO = ["en:beverages-and-beverages-preparations", "en:cocoa-and-its-products", "en:beverage-preparations", "en:cocoa-and-chocolate-powders", "en:instant-beverages", "en:instant-chocolate-powders"];
const MAIONESE = ["en:condiments", "en:sauces", "en:mayonnaises"];
const LEITE_CONDENSADO = ["en:dairies", "en:condensed-milks"];
const BISCOITO_RECHEADO = ["en:snacks", "en:sweet-snacks", "en:biscuits-and-cakes", "en:biscuits-and-crackers", "en:biscuits", "en:chocolate-biscuits", "en:filled-biscuits"];
const OLEO_DE_SOJA = ["en:plant-based-foods-and-beverages", "en:plant-based-foods", "en:fats", "en:vegetable-fats", "en:vegetable-oils", "en:soybean-oils"];
const MARGARINA = ["en:plant-based-foods-and-beverages", "en:spreads", "en:fats", "en:spreadable-fats", "en:margarines", "en:salted-margarines"];

test("a fonte e os numeros sao os da TACO 4a edicao", () => {
  assert.match(FONTE_DAS_FAIXAS, /^TACO - Tabela Brasileira de Composição de Alimentos, 4ª edição/);
  assert.equal(FAIXAS_TACO.length, 12);
  assert.equal(new Set(FAIXAS_TACO.map((faixa) => faixa.chave)).size, 12);
  for (const faixa of FAIXAS_TACO) {
    assert.ok(faixa.nome && faixa.referencias.length, faixa.chave);
    assert.ok(faixa.categorias.qualquer?.length || faixa.categorias.ou, faixa.chave);
    for (const referencia of faixa.referencias) {
      assert.ok(Number.isInteger(referencia.taco) && referencia.alimento, faixa.chave);
      assert.equal(typeof referencia.kcal, "number", `${referencia.taco} sem kcal`);
    }
  }
  // Conferidos contra a planilha oficial em 06/11/2026 (os 25 itens bateram).
  const item = (numero) => FAIXAS_TACO.flatMap((faixa) => faixa.referencias).find((referencia) => referencia.taco === numero);
  assert.deepEqual(item(491), { taco: 491, alimento: "Achocolatado, pó", kcal: 401, carboidratos: 91.2, proteinas: 4.2, gorduras: 2.2, saturadas: 1.1 });
  assert.deepEqual(item(524), { taco: 524, alimento: "Maionese, tradicional com ovos", kcal: 302, carboidratos: 7.9, proteinas: 0.6, gorduras: 30.5, saturadas: 4.1 });
  assert.equal(item(459).gorduras, 26.9);
  assert.equal(item(48).proteinas, 12.4); // 12,35 na planilha
  assert.equal(item(264).saturadas, null); // "NA" na planilha: fica fora da faixa
});

test("o tipo vem da categoria da OFF, nunca do nome ou da marca", () => {
  assert.equal(tipoDoProduto({ product_name: "Nescau", brands: "Nestlé" }), null);
  assert.equal(tipoDoProduto({ categories_tags: [] }), null);
  assert.equal(tipoDoProduto(null), null);
  assert.equal(tipoDoProduto({ categories_tags: MAIONESE }).chave, "maionese");
  // Nescau Lata 7891000426210 vem com "pt:Achocolatados", com maiuscula.
  assert.equal(tipoDoProduto({ categories_tags: ["en:beverage-preparations", "en:instant-beverages", "pt:Achocolatados"] }).chave, "achocolatado-em-po");
  assert.equal(tipoDoProduto({ categories_tags: ["en:sliced-breads"] }).chave, "pao-de-forma");
});

test("cacau puro e torrone nao sao achocolatado nem wafer (ajuste da primeira passada nos 200)", () => {
  // Cacau Po Soluvel Dois Frades 7891000120095: 23 g de proteina e normal para cacau.
  const cacau = off("7891000120095", { "energy-kcal": 348, "energy-kj": 1457, carbohydrates: 15, sugars: 0, proteins: 23, fat: 13, "saturated-fat": 6.6, fiber: 35, salt: 0.0475, sodium: 0.019 }, ["en:cocoa-and-its-products", "en:cocoa-and-chocolate-powders"]);
  // Turron & Mani 77940131: a OFF marca como wafer recheado.
  const turron = off("77940131", { "energy-kcal": 425.9, "energy-kj": 1655, carbohydrates: 73, sugars: 40, proteins: 8.8, fat: 7.9, "saturated-fat": 1.3, fiber: 1.6, salt: 0.1275, sodium: 0.051 }, ["en:snacks", "en:sweet-snacks", "en:biscuits-and-cakes", "en:biscuits-and-crackers", "en:christmas-foods-and-drinks", "en:confectioneries", "en:biscuits", "en:christmas-sweets", "en:turron", "en:wafers", "en:stuffed-wafers", "en:peanut-turron", "en:creamy-peanut-turron"]);
  for (const produto of [cacau, turron]) {
    assert.equal(tipoDoProduto(produto), null, produto.code);
    assert.deepEqual(conferirFaixaDoTipo(produto), { tipo: null, problemas: [] });
    assert.equal(avaliarTabelaNutricional(produto).estado, CONFIANCA.COMPLETA, produto.code);
  }
});

test("erro real: a coluna do produto preparado gravada como se fosse o po (foto)", () => {
  // Nescau Lata 7891000426210: 86 kcal e 361 kJ conferem entre si - so a faixa pega.
  const nescauLata = off("7891000426210", { "energy-kcal": 86, "energy-kj": 361.4, carbohydrates: 13, sugars: 12, proteins: 3.5, fat: 2.1, "saturated-fat": 1.3, fiber: 0.4, salt: 0.1275, sodium: 0.051 }, ["en:beverages-and-beverages-preparations", "en:beverage-preparations", "en:instant-beverages", "pt:Achocolatados"]);
  const toddyOriginal = off("7892840819170", { "energy-kcal": 63, "energy-kj": 264, carbohydrates: 12, sugars: 11, proteins: 3.3, fat: 0.2, "saturated-fat": 0.2, fiber: 0, salt: 0.2, sodium: 0.08 }, ACHOCOLATADO);
  const leiteMoca = off("7891000065440", { "energy-kcal": 47, "energy-kj": 195.73, carbohydrates: 4.83, sugars: 4.66, proteins: 3.31, fat: 1.55, "saturated-fat": 1.04, fiber: 0, salt: 0.225, sodium: 0.09 }, ["en:dairies", "en:canned-foods", "en:milks-liquid-and-powder", "en:milks", "en:condensed-milks"]);

  assert.deepEqual(avaliarTabelaNutricional(nescauLata), {
    estado: CONFIANCA.NAO_BATE,
    faltando: [],
    problemas: ["A energia e os carboidratos estão muito abaixo do normal para achocolatado em pó."],
  });
  assert.deepEqual(conferirFaixaDoTipo(toddyOriginal).problemas, ["A energia, os carboidratos, as gorduras totais e as gorduras saturadas estão muito abaixo do normal para achocolatado em pó."]);
  assert.deepEqual(conferirFaixaDoTipo(leiteMoca).problemas, ["A energia, os carboidratos, as gorduras totais e as gorduras saturadas estão muito abaixo do normal para leite condensado."]);
  for (const produto of [toddyOriginal, leiteMoca]) assert.equal(avaliarTabelaNutricional(produto).estado, CONFIANCA.NAO_BATE, produto.code);
});

test("erro real: zero no lugar do numero, numero da porcao, digito a mais (foto)", () => {
  const casos = [
    // Hellmann's 7894000050034: saturada 0; o rotulo diz 4,8 g.
    [off("7894000050034", { "energy-kcal": 308.3, "energy-kj": 1277, carbohydrates: 6.67, sugars: 0, proteins: 0.83, fat: 30.83, "saturated-fat": 0, fiber: 0, salt: 1.5, sodium: 0.6 }, MAIONESE), "As gorduras saturadas estão muito abaixo do normal para maionese."],
    // Passatempo 7891000241356: saturada 1; o rotulo diz 1,2 g em 30 g (4 g em 100 g).
    [off("7891000241356", { "energy-kcal": 470, "energy-kj": 1956.2, carbohydrates: 72, sugars: 9.2, proteins: 5.6, fat: 17, "saturated-fat": 1, fiber: 1, salt: 0.1175, sodium: 0.047 }, BISCOITO_RECHEADO), "As gorduras saturadas estão muito abaixo do normal para biscoito recheado."],
    // Oleo de soja 7898247780075: os numeros sao de uma porcao de 13 ml.
    [off("7898247780075", { "energy-kcal": 108, "energy-kj": 454, carbohydrates: 0, sugars: 0, proteins: 0, fat: 12, "saturated-fat": 1.9, fiber: 0 }, OLEO_DE_SOJA), "A energia, as gorduras totais e as gorduras saturadas estão muito abaixo do normal para óleo vegetal."],
    // Cremosa 7893000394209: 7220 kcal; o rotulo diz 720.
    [off("7893000394209", { "energy-kcal": 7220, "energy-kj": 3020, fat: 80, "saturated-fat": 24, salt: 1.5, sodium: 0.6 }, MARGARINA), "A energia está muito acima do normal para margarina."],
  ];
  for (const [produto, frase] of casos) {
    assert.deepEqual(conferirFaixaDoTipo(produto).problemas, [frase], produto.code);
    const selo = avaliarTabelaNutricional(produto);
    assert.equal(selo.estado, CONFIANCA.NAO_BATE, produto.code);
    assert.ok(selo.problemas.includes(frase), produto.code);
  }
});

test("nao acusa o produto certo, nem a versao light (todos com tipo, para o teste valer)", () => {
  const certos = [
    // Conferidos contra a foto do rotulo:
    off("7891000325858", { "energy-kcal": 496, carbohydrates: 37.6, proteins: 25.2, fat: 26.8, "saturated-fat": 17.6 }, ["en:dairies", "en:milks", "en:whole-milks", "en:milk-powders", "en:whole-milk-powder"]),
    off("7892840819507", { "energy-kcal": 375, carbohydrates: 90, proteins: 1.5, fat: 1, "saturated-fat": 1 }, ACHOCOLATADO),
    off("7891000379585", { "energy-kcal": 380, carbohydrates: 85, proteins: 3, fat: 2, "saturated-fat": 1 }, ACHOCOLATADO),
    off("7898215152002", { "energy-kcal": 305, carbohydrates: 55, proteins: 8, fat: 6, "saturated-fat": 4 }, LEITE_CONDENSADO),
    off("7898215151784", { "energy-kcal": 182, carbohydrates: 4.3, proteins: 2.9, fat: 17, "saturated-fat": 11 }, ["en:dairies", "en:creams", "en:uht-creams"]),
    off("7891203010056", { "energy-kcal": 252, carbohydrates: 50, proteins: 8.4, fat: 2.6, "saturated-fat": 1 }, ["en:breads", "en:sliced-breads"]),
    // Sem foto, mas com tabela coerente:
    off("7894000050027", { "energy-kcal": 304, carbohydrates: 6.7, proteins: 0.6, fat: 30, "saturated-fat": 4.8 }, MAIONESE),
    off("7891107101621", { "energy-kcal": 828, carbohydrates: 0, proteins: 0, fat: 92, "saturated-fat": 15 }, OLEO_DE_SOJA),
    off("5601216120152", { "energy-kcal": 830.8, carbohydrates: 0, proteins: 0, fat: 92.3, "saturated-fat": 13.08 }, ["en:fats", "en:vegetable-oils", "en:olive-oils"]),
    // Light: requeijao com gordura reduzida (143 kcal) e creme vegetal com 30% de gordura.
    off("7896625211395", { "energy-kcal": 143, carbohydrates: 4, proteins: 11, fat: 9.2, "saturated-fat": 5.9 }, ["en:dairies", "en:cheeses", "en:cream-cheeses", "pt:requeijao-cremoso"]),
    off("7891152507799", { "energy-kcal": 270, carbohydrates: 0, proteins: 0, fat: 30, "saturated-fat": 10 }, MARGARINA),
  ];
  for (const produto of certos) {
    const resultado = conferirFaixaDoTipo(produto);
    assert.ok(resultado.tipo, `${produto.code} ficou sem tipo`);
    assert.deepEqual(resultado.problemas, [], produto.code);
  }
});

test("onde a faixa corta: 40% e 160% da energia, um terco e o dobro + 3 g", () => {
  const toddy = (extra) => off("7892840819507", { "energy-kcal": 375, carbohydrates: 90, proteins: 1.5, fat: 1, "saturated-fat": 1, ...extra }, ACHOCOLATADO);
  // Achocolatado na TACO: 401 kcal, 91,2 g de carboidrato, 4,2 g de proteina.
  assert.deepEqual(conferirFaixaDoTipo(toddy({ "energy-kcal": 161 })).problemas, []);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ "energy-kcal": 160 })).problemas, ["A energia está muito abaixo do normal para achocolatado em pó."]);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ "energy-kcal": 641 })).problemas, []);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ "energy-kcal": 642 })).problemas, ["A energia está muito acima do normal para achocolatado em pó."]);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ carbohydrates: 30.5 })).problemas, []);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ carbohydrates: 30.3 })).problemas, ["Os carboidratos estão muito abaixo do normal para achocolatado em pó."]);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ proteins: 11.4 })).problemas, []);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ proteins: 11.5 })).problemas, ["As proteínas estão muito acima do normal para achocolatado em pó."]);
  // Referencia abaixo de 1 g nao tem piso: maionese da TACO tem 0,6 g de
  // proteina, entao maionese com zero passa; no achocolatado (4,2 g) nao.
  const maioneseSemProteina = off("7894000050027", { "energy-kcal": 304, carbohydrates: 6.7, proteins: 0, fat: 30, "saturated-fat": 4.8 }, MAIONESE);
  assert.deepEqual(conferirFaixaDoTipo(maioneseSemProteina).problemas, []);
  assert.deepEqual(conferirFaixaDoTipo(toddy({ proteins: 0 })).problemas, ["As proteínas estão muito abaixo do normal para achocolatado em pó."]);
  // Item que a base nao traz nao e acusado: so a faixa do que existe.
  const semSaturada = toddy();
  delete semSaturada.nutriments["saturated-fat_100g"];
  assert.deepEqual(conferirFaixaDoTipo(semSaturada).problemas, []);
  // Abaixo e acima no mesmo produto: duas frases, uma por sentido.
  assert.deepEqual(conferirFaixaDoTipo(toddy({ "energy-kcal": 100, proteins: 20 })).problemas, [
    "A energia está muito abaixo do normal para achocolatado em pó.",
    "As proteínas estão muito acima do normal para achocolatado em pó.",
  ]);
});

test("base local nao tem categoria da OFF: a faixa nao roda nela", () => {
  for (const alimento of LOCAL_FOODS) {
    assert.deepEqual(conferirFaixaDoTipo(toLocalProduct(alimento)), { tipo: null, problemas: [] }, alimento.name);
  }
});

test("sem rede: o produto guardado no aparelho mantem a categoria, e a faixa continua valendo", () => {
  const hellmanns = off("7894000050034", { "energy-kcal": 308.3, carbohydrates: 6.67, proteins: 0.83, fat: 30.83, "saturated-fat": 0 }, MAIONESE);
  const guardado = reduzirProduto(hellmanns);
  assert.deepEqual(guardado.categories_tags, MAIONESE);
  assert.deepEqual(conferirFaixaDoTipo(guardado).problemas, ["As gorduras saturadas estão muito abaixo do normal para maionese."]);
});
