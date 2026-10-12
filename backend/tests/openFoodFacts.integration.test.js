import assert from "node:assert/strict";
import test from "node:test";

import { analyzeProductAllergens } from "../../shared/allergenEngine.js";
import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";
import { ENCONTRADO, ORIGEM_MANUAL, consultarProdutoPorCodigo } from "../../src/services/productLookup.js";
import { fetchProductByBarcode } from "../../src/services/openFoodFactsService.js";

// O CONTRATO REAL DA OPEN FOOD FACTS
//
// No gate E2E a busca a Open Food Facts e injetada, de proposito: o que se prova
// la e o nosso caminho, nao a disponibilidade de terceiro. O efeito colateral era
// que o formato REAL da resposta - campos, `status`, nomes de alergenico - nunca
// era exercitado por nenhum teste. Se a OFF mudasse o contrato, so a pessoa no
// mercado descobriria.
//
// Este teste consulta a API publica de verdade, somente leitura. Fica desligado
// num `npm test` comum: rede de terceiro nao pode deixar o build vermelho. Para
// rodar:
//
//   RUN_OFF_INTEGRATION_TESTS=true npm --prefix backend test
//
// Pulado, ele se declara NAO EXECUTADO - e NAO EXECUTADO nunca conta como PASS.

const deveRodar = process.env.RUN_OFF_INTEGRATION_TESTS === "true";
const pular = deveRodar ? false : "NAO EXECUTADO - defina RUN_OFF_INTEGRATION_TESTS=true para consultar a Open Food Facts real";

// Nutella 400 g: o produto de exemplo da propria documentacao da OFF, estavel ha
// anos, e com leite declarado - o que permite exercitar o motor de ponta a ponta.
const NUTELLA = "3017620422003";

test("OFF real: o produto chega no formato que o app le", { skip: pular }, async () => {
  const produto = await fetchProductByBarcode(NUTELLA);

  assert.ok(produto, "a Open Food Facts nao devolveu o produto de referencia");
  assert.equal(produto.code, NUTELLA);
  assert.equal(typeof produto.product_name, "string");
  assert.ok(produto.product_name.length > 0, "o produto veio sem nome");
  assert.ok(Array.isArray(produto.allergens_tags), "allergens_tags deixou de ser lista");
  assert.ok(
    produto.allergens_tags.every((tag) => /^[a-z]{2}:/.test(tag)),
    `allergens_tags mudou de formato: ${JSON.stringify(produto.allergens_tags)}`,
  );
  assert.equal(produto.source, "Open Food Facts");
});

test("OFF real: do codigo digitado ao veredito, o leite e encontrado", { skip: pular }, async () => {
  // O caminho inteiro com dado real: conferencia de entrada, busca real, motor
  // deterministico e veredito. Se a OFF renomear um campo que o motor le, o
  // conflito some - e o teste fica vermelho em vez de a tela ficar verde.
  const resultado = await consultarProdutoPorCodigo(NUTELLA, { origem: ORIGEM_MANUAL });
  assert.equal(resultado.estado, ENCONTRADO, `estado ${resultado.estado}`);

  const perfil = ["milk"];
  const analise = analyzeProductAllergens(resultado.produto, perfil);
  const veredito = buildAllergyVerdict({ profileRisks: analise.profileRisks, profileAllergies: perfil, hasProductContext: true });

  assert.equal(veredito.status, "conflict", `o leite da Nutella nao foi detectado: ${JSON.stringify(veredito)}`);
});
