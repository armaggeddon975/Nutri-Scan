import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { analyzeProductAllergens } from "../../shared/allergenEngine.js";
import { CONFLICT_MINIMUM_SAFETY, buildAllergyVerdict } from "../../shared/allergyVerdict.js";
import {
  CODIGO_INVALIDO,
  ENCONTRADO,
  ERRO_DE_REDE,
  NAO_ENCONTRADO,
  ORIGEM_CAMERA,
  ORIGEM_MANUAL,
  consultarProdutoPorCodigo,
} from "../../src/services/productLookup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

// v0.7.3.
//
// Ate esta versao o caminho principal do produto - o que decide qual alimento a
// pessoa esta vendo - nunca tinha sido exercitado por teste. Ele vivia dentro
// de um `useCallback` em `App.jsx`, e o projeto nao tem renderizador de React
// nos testes.
//
// A extracao para `services/productLookup.js` nao criou um caminho paralelo:
// nomeou o unico caminho. `App.jsx`, o gate E2E e estes testes executam a MESMA
// funcao.

const CODIGO_VALIDO = "7891000100103";

// Leite condensado: conflita com quem tem alergia a leite.
const PRODUTO_EM_CONFLITO = {
  code: CODIGO_VALIDO,
  product_name: "Leite Condensado",
  brands: "Nestle",
  ingredients_text: "leite integral, açúcar",
};

function criarBuscaFalsa(produtoPorCodigo = { [CODIGO_VALIDO]: PRODUTO_EM_CONFLITO }) {
  const chamadas = [];
  const buscar = async (codigo) => {
    chamadas.push(codigo);
    return produtoPorCodigo[codigo] ?? null;
  };
  return { buscar, chamadas };
}

// ---------------------------------------------------------------------------
// M2 - codigo invalido nao gera requisicao de rede
// ---------------------------------------------------------------------------

test("M2 codigo invalido nao chega a rede", async () => {
  const invalidos = [
    ["digito verificador errado", "7891000100104"],
    ["tamanho errado", "12345"],
    ["com letra", "789100010010a"],
    ["vazio", ""],
    ["so separadores", " - - "],
  ];

  for (const [rotulo, entrada] of invalidos) {
    const { buscar, chamadas } = criarBuscaFalsa();
    const resultado = await consultarProdutoPorCodigo(entrada, {
      origem: ORIGEM_MANUAL,
      buscar,
    });

    assert.equal(resultado.estado, CODIGO_INVALIDO, `${rotulo} nao foi recusado`);
    assert.equal(
      chamadas.length,
      0,
      `${rotulo} gerou ${chamadas.length} requisicao(oes) de rede antes de ser recusado`,
    );
    assert.ok(resultado.mensagem, `${rotulo} ficou sem mensagem`);
  }
});

test("M2 codigo valido chega a rede exatamente uma vez, na forma canonica", async () => {
  const { buscar, chamadas } = criarBuscaFalsa();
  const resultado = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_MANUAL,
    buscar,
  });

  assert.equal(resultado.estado, ENCONTRADO);
  assert.deepEqual(chamadas, [CODIGO_VALIDO]);
});

test("M2 UPC-A digitado consulta a rede pela forma canonica EAN-13", async () => {
  // Se consultasse pela forma de 12 digitos, o mesmo produto viraria duas
  // chaves distintas no historico, que e indexado por `(user_id, product_code)`.
  const { buscar, chamadas } = criarBuscaFalsa({ "0036000291452": { code: "0036000291452" } });
  const resultado = await consultarProdutoPorCodigo("036000291452", {
    origem: ORIGEM_MANUAL,
    buscar,
  });

  assert.equal(resultado.estado, ENCONTRADO);
  assert.deepEqual(chamadas, ["0036000291452"]);
  assert.equal(resultado.codigo, "0036000291452");
});

// ---------------------------------------------------------------------------
// M6 - "nao encontrado" e "codigo invalido" sao estados distintos
// ---------------------------------------------------------------------------

test("M6 nao encontrado e codigo invalido sao estados diferentes", async () => {
  const { buscar } = criarBuscaFalsa();

  // Codigo VALIDO, produto ausente da base.
  const semCadastro = await consultarProdutoPorCodigo("5449000000996", {
    origem: ORIGEM_MANUAL,
    buscar,
  });
  assert.equal(semCadastro.estado, NAO_ENCONTRADO);
  assert.equal(semCadastro.codigo, "5449000000996");

  // Codigo INVALIDO.
  const invalido = await consultarProdutoPorCodigo("5449000000997", {
    origem: ORIGEM_MANUAL,
    buscar,
  });
  assert.equal(invalido.estado, CODIGO_INVALIDO);

  assert.notEqual(semCadastro.estado, invalido.estado);
});

test("M6 falha de rede nao e confundida com produto inexistente", async () => {
  const resultado = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_MANUAL,
    buscar: async () => {
      throw new Error("rede fora");
    },
  });

  assert.equal(resultado.estado, ERRO_DE_REDE);
  assert.notEqual(resultado.estado, NAO_ENCONTRADO);
});

// ---------------------------------------------------------------------------
// M4 - paridade entre o caminho manual e o da camera
// ---------------------------------------------------------------------------

test("M4 o mesmo codigo devolve o mesmo produto pelos dois caminhos", async () => {
  const manual = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_MANUAL,
    buscar: criarBuscaFalsa().buscar,
  });
  const camera = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_CAMERA,
    buscar: criarBuscaFalsa().buscar,
  });

  assert.deepEqual(manual, camera, "os dois caminhos divergiram");
});

test("M4 o veredito de alergia e identico pelos dois caminhos", async () => {
  const perfil = ["milk"];

  async function consultarEJulgar(origem) {
    const resultado = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
      origem,
      buscar: criarBuscaFalsa().buscar,
    });
    assert.equal(resultado.estado, ENCONTRADO);

    // Depois da consulta, os dois caminhos passam pelo MESMO motor e pelo
    // MESMO veredito. Se algum dia um deles montar o resultado por conta
    // propria, este teste fica vermelho.
    const analise = analyzeProductAllergens(resultado.produto, perfil);
    return buildAllergyVerdict({ profileRisks: analise.profileRisks, profileAllergies: perfil, hasProductContext: true });
  }

  const vereditoManual = await consultarEJulgar(ORIGEM_MANUAL);
  const vereditoCamera = await consultarEJulgar(ORIGEM_CAMERA);

  assert.deepEqual(vereditoManual, vereditoCamera, "o veredito divergiu entre os caminhos");
});

test("M4 UPC-A digitado e o EAN-13 escaneado sao o mesmo produto", async () => {
  // A pessoa digita o UPC-A de 12 digitos; a camera le o EAN-13 de 13. Precisa
  // ser um produto so, senao o historico duplica e o favorito de um caminho nao
  // aparece no outro.
  const base = { "0036000291452": { code: "0036000291452", product_name: "Produto" } };

  const digitado = await consultarProdutoPorCodigo("036000291452", {
    origem: ORIGEM_MANUAL,
    buscar: criarBuscaFalsa(base).buscar,
  });
  const escaneado = await consultarProdutoPorCodigo("0036000291452", {
    origem: ORIGEM_CAMERA,
    buscar: criarBuscaFalsa(base).buscar,
  });

  assert.equal(digitado.codigo, escaneado.codigo);
  assert.deepEqual(digitado.produto, escaneado.produto);
});

test("M4 a camera continua lendo simbologia sem digito verificador de EAN", async () => {
  // ITF-14 e CODE_128 sao formatos que o scanner aceita e que NAO tem digito
  // verificador de EAN. Aplicar a conferencia de digitacao a saida da camera
  // recusaria caixa de papelao e etiqueta de balanca - leituras legitimas.
  const itf14 = "12345678901231";
  const { buscar, chamadas } = criarBuscaFalsa({ [itf14]: { code: itf14 } });

  const resultado = await consultarProdutoPorCodigo(itf14, {
    origem: ORIGEM_CAMERA,
    buscar,
  });

  assert.equal(resultado.estado, ENCONTRADO, "a camera deveria conseguir ler ITF-14");
  assert.deepEqual(chamadas, [itf14]);

  // E o mesmo codigo digitado a mao e recusado, porque digitar nao tem a
  // protecao que a simbologia da.
  const manual = await consultarProdutoPorCodigo(itf14, { origem: ORIGEM_MANUAL, buscar });
  assert.equal(manual.estado, CODIGO_INVALIDO);
});

// ---------------------------------------------------------------------------
// M5 - produto em conflito, consultado por codigo digitado
// ---------------------------------------------------------------------------

test("M5 produto em conflito digitado produz veredito de conflito", async () => {
  const perfil = ["milk"];
  const resultado = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_MANUAL,
    buscar: criarBuscaFalsa().buscar,
  });

  assert.equal(resultado.estado, ENCONTRADO);

  const analise = analyzeProductAllergens(resultado.produto, perfil);
  const veredito = buildAllergyVerdict({ profileRisks: analise.profileRisks, profileAllergies: perfil, hasProductContext: true });

  assert.equal(veredito.status, "conflict", `veredito veio como ${veredito.status}`);
  assert.ok(
    veredito.conflicts.some((item) => item.id === "milk"),
    `o conflito de leite nao apareceu: ${JSON.stringify(veredito.conflicts)}`,
  );
});

test("M5 o piso de risco vale no caminho manual", async () => {
  const perfil = ["milk"];
  const resultado = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_MANUAL,
    buscar: criarBuscaFalsa().buscar,
  });

  const analise = analyzeProductAllergens(resultado.produto, perfil);
  const veredito = buildAllergyVerdict({
    profileRisks: analise.profileRisks,
    profileAllergies: perfil,
    hasProductContext: true,
  });

  // `minimumSafety` e o piso de risco. Ele nao e rotulo informativo: e o que
  // impede que uma resposta adiante - a do modelo, por exemplo - rebaixe um
  // conflito declarado para "normal". Foi a ausencia disso que produziu C1.
  assert.equal(
    veredito.minimumSafety,
    CONFLICT_MINIMUM_SAFETY,
    "o piso de risco nao foi aplicado no caminho manual",
  );
});

test("M5 sem conflito o veredito nao inventa alerta", async () => {
  const semLeite = {
    code: CODIGO_VALIDO,
    product_name: "Arroz",
    ingredients_text: "arroz polido",
  };
  const resultado = await consultarProdutoPorCodigo(CODIGO_VALIDO, {
    origem: ORIGEM_MANUAL,
    buscar: criarBuscaFalsa({ [CODIGO_VALIDO]: semLeite }).buscar,
  });

  const analise = analyzeProductAllergens(resultado.produto, ["milk"]);
  const veredito = buildAllergyVerdict({ profileRisks: analise.profileRisks, profileAllergies: ["milk"], hasProductContext: true });

  assert.notEqual(veredito.status, "conflict");
});

// ---------------------------------------------------------------------------
// Um caminho so
// ---------------------------------------------------------------------------

test("o caminho manual nao monta o resultado por conta propria", async () => {
  const fonte = await readFile(path.join(rootDir, "src/App.jsx"), "utf8");

  // `App.jsx` nao pode chamar a busca diretamente nem construir o veredito num
  // ramo separado para o codigo digitado: tem que passar por
  // `consultarProdutoPorCodigo`, que e o caminho unico.
  assert.match(fonte, /consultarProdutoPorCodigo\(nextQuery, \{ origem \}\)/);
  assert.doesNotMatch(
    fonte,
    /await fetchProductByBarcode\(/,
    "App.jsx voltou a chamar a busca por fora do caminho unico",
  );

  const lookup = await readFile(path.join(rootDir, "src/services/productLookup.js"), "utf8");
  assert.match(lookup, /from "\.\.\/\.\.\/shared\/barcode\.js"/);
});
