import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { LOCAL_FOODS } from "../../src/data/foods.js";
import { avaliarTabelaNutricional, CONFIANCA, ITENS_DA_TABELA, listarEmPortugues } from "../../src/utils/confiancaDaTabela.js";
import { getNutrientRows } from "../../src/utils/nutrition.js";
import { toLocalProduct } from "../../src/utils/product.js";

// SELO DE CONFIANCA DA TABELA NUTRICIONAL (06/11/2026)
//
// O selo diz se a tabela esta completa e se as contas batem. Os casos reais
// vem da Open Food Facts, lida em 06/11/2026 (numeros copiados aqui, sem rede).

const rootDir = path.resolve(import.meta.dirname, "..", "..");

// Um produto com a tabela inteira e coerente: 4 x 60 + 4 x 8 + 9 x 10 = 362 kcal.
function completo(extra = {}) {
  return {
    nutriments: {
      "energy-kcal_100g": 362,
      "energy-kj_100g": 1515,
      carbohydrates_100g: 60,
      sugars_100g: 20,
      proteins_100g: 8,
      fat_100g: 10,
      "saturated-fat_100g": 4,
      fiber_100g: 3,
      salt_100g: 1,
      sodium_100g: 0.4,
      sodium_unit: "g",
      ...extra,
    },
  };
}

test("tabela inteira e coerente: completa, sem nada faltando", () => {
  assert.deepEqual(avaliarTabelaNutricional(completo()), { estado: CONFIANCA.COMPLETA, faltando: [], problemas: [] });
});

test("falta item: incompleta, e diz quais, na ordem da tabela", () => {
  const produto = completo();
  delete produto.nutriments.sugars_100g;
  delete produto.nutriments.fiber_100g;
  const avaliacao = avaliarTabelaNutricional(produto);
  assert.equal(avaliacao.estado, CONFIANCA.INCOMPLETA);
  assert.deepEqual(avaliacao.faltando, ["açúcares", "fibras"]);
  assert.equal(listarEmPortugues(avaliacao.faltando), "açúcares e fibras");
  assert.equal(listarEmPortugues(["açúcares", "fibras", "sódio"]), "açúcares, fibras e sódio");
});

test("sal ou sodio contam como o mesmo item", () => {
  const soSal = completo();
  delete soSal.nutriments.sodium_100g;
  assert.equal(avaliarTabelaNutricional(soSal).estado, CONFIANCA.COMPLETA);
  const soSodio = completo();
  delete soSodio.nutriments.salt_100g;
  assert.equal(avaliarTabelaNutricional(soSodio).estado, CONFIANCA.COMPLETA);
});

test("sem nenhum numero: sem tabela", () => {
  assert.equal(avaliarTabelaNutricional({ nutriments: {} }).estado, CONFIANCA.SEM_TABELA);
  assert.equal(avaliarTabelaNutricional(null).estado, CONFIANCA.SEM_TABELA);
  assert.equal(ITENS_DA_TABELA.length, 8);
});

test("cada conta errada vira 'nao bate', com a frase dela", () => {
  const casos = [
    [{ "energy-kcal_100g": 900, "energy-kj_100g": 3766 }, "A energia não confere com os carboidratos, as proteínas e as gorduras."],
    [{ "energy-kj_100g": 400 }, "A base traz dois valores diferentes para a energia."],
    [{ salt_100g: 3 }, "O sal e o sódio não conferem entre si."],
    [{ sugars_100g: 70 }, "Os açúcares passam dos carboidratos."],
    [{ "saturated-fat_100g": 12 }, "As gorduras saturadas passam das gorduras totais."],
    [{ carbohydrates_100g: 90, proteins_100g: 20, "energy-kcal_100g": 530, "energy-kj_100g": 2218 }, "A soma dos nutrientes passa de 100 g."],
    [{ proteins_100g: -1, "energy-kcal_100g": 330, "energy-kj_100g": 1381 }, "Há um número negativo na tabela."],
  ];
  for (const [extra, frase] of casos) {
    const avaliacao = avaliarTabelaNutricional(completo(extra));
    assert.equal(avaliacao.estado, CONFIANCA.NAO_BATE, frase);
    assert.ok(avaliacao.problemas.includes(frase), `${frase}: ${JSON.stringify(avaliacao.problemas)}`);
  }
});

test("caso real: o Nescau 7891000412855 traz 86 kcal de uma porcao e 1.606 kJ de 100 g", () => {
  // Valores lidos da Open Food Facts em 06/11/2026.
  const nescau = {
    nutriments: {
      "energy-kcal_100g": 86,
      "energy-kj_100g": 1606,
      carbohydrates_100g: 13,
      sugars_100g: 12,
      proteins_100g: 3.5,
      fat_100g: 2.1,
      "saturated-fat_100g": 1.3,
      fiber_100g: 0.4,
      salt_100g: 0.125,
      sodium_100g: 0.05,
      sodium_unit: "g",
    },
  };
  const avaliacao = avaliarTabelaNutricional(nescau);
  assert.equal(avaliacao.estado, CONFIANCA.NAO_BATE);
  assert.deepEqual(avaliacao.problemas, ["A base traz dois valores diferentes para a energia."]);
});

test("arredondamento do rotulo nao e acusado", () => {
  // Bebida quase sem caloria: 3 kcal e 23,8 kJ (Energy Ultra, OFF, 06/11/2026).
  const bebida = { nutriments: { "energy-kcal_100g": 3, "energy-kj_100g": 23.8, carbohydrates_100g: 0.9, proteins_100g: 0, fat_100g: 0 } };
  assert.deepEqual(avaliarTabelaNutricional(bebida).problemas, []);
  // Feijao no padrao da TACO: o carboidrato ja inclui a fibra (76 kcal).
  const feijaoTaco = { nutriments: { "energy-kcal_100g": 76, carbohydrates_100g: 13.6, proteins_100g: 4.8, fat_100g: 0.5, fiber_100g: 8.5 } };
  assert.deepEqual(avaliarTabelaNutricional(feijaoTaco).problemas, []);
  // Padrao europeu: fibra a parte, com 2 kcal por grama.
  const europeu = { nutriments: { "energy-kcal_100g": 120, carbohydrates_100g: 20, proteins_100g: 3, fat_100g: 1, fiber_100g: 10 } };
  assert.deepEqual(avaliarTabelaNutricional(europeu).problemas, []);
  // Bala sem acucar: o poliol conta 2,4 kcal por grama.
  const bala = { nutriments: { "energy-kcal_100g": 240, carbohydrates_100g: 98, polyols_100g: 98, proteins_100g: 0, fat_100g: 0 } };
  assert.deepEqual(avaliarTabelaNutricional(bala).problemas, []);
});

test("base local: o selo le o sodio em mg, como a tela, e nenhum dos 8 'nao bate'", () => {
  for (const alimento of LOCAL_FOODS) {
    const produto = toLocalProduct(alimento);
    const avaliacao = avaliarTabelaNutricional(produto);
    assert.notEqual(avaliacao.estado, CONFIANCA.NAO_BATE, `${alimento.name}: ${avaliacao.problemas.join(" ")}`);
    assert.notEqual(avaliacao.estado, CONFIANCA.SEM_TABELA, alimento.name);
  }
  const pao = toLocalProduct(LOCAL_FOODS.find((alimento) => alimento.id === "pao-frances") ?? LOCAL_FOODS[4]);
  assert.equal(getNutrientRows(pao.nutriments).find((linha) => linha.key === "sodium").amount, "648");
});

async function renderizarSelo() {
  const { build } = await import("esbuild");
  const pacote = await build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { SeloDaTabela } from "./src/components/food/SeloDaTabela.jsx";
        export const render = (product) => renderToStaticMarkup(React.createElement(SeloDaTabela, { product }));
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
  const pasta = mkdtempSync(path.join(tmpdir(), "nutriscan-selo-"));
  try {
    const arquivo = path.join(pasta, "selo.mjs");
    writeFileSync(arquivo, pacote.outputFiles[0].text, "utf8");
    return (await import(pathToFileURL(arquivo).href)).render;
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

test("na tela: o estado esta no titulo escrito, nao so na cor; base local nao manda conferir embalagem", async () => {
  const render = await renderizarSelo();
  const semCor = (html) => html.replace(/\sclass="[^"]*"/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const incompleto = completo();
  delete incompleto.nutriments.fiber_100g;
  const htmls = {
    completa: render(completo()),
    incompleta: render(incompleto),
    naoBate: render(completo({ "energy-kj_100g": 400 })),
  };
  assert.equal(semCor(htmls.completa), "Tabela completa Os números conferem entre si.");
  assert.equal(semCor(htmls.incompleta), "Tabela incompleta Falta: fibras. Confira a embalagem.");
  assert.equal(semCor(htmls.naoBate), "Os números não batem A base traz dois valores diferentes para a energia. Confira a embalagem.");
  for (const html of Object.values(htmls)) assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.equal(render({ nutriments: {} }), "");
  const arroz = toLocalProduct(LOCAL_FOODS[0]);
  assert.doesNotMatch(semCor(render(arroz)), /Confira a embalagem/);
  assert.match(semCor(render(arroz)), /^Tabela incompleta Faltam: /);
});

test("contraste do texto do selo: as tres combinacoes passam de 4,5:1", () => {
  const css = readFileSync(path.join(rootDir, "src/styles.css"), "utf8");
  const token = (nome) => css.match(new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})`))[1];
  const luminancia = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a, b) => {
    const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
    return (claro + 0.05) / (escuro + 0.05);
  };
  const v070 = readFileSync(path.join(rootDir, "src/styles-v070.css"), "utf8");
  assert.match(v070, /\.selo-completa \{[^}]*background: var\(--ok-soft\);[^}]*color: var\(--ok\);/);
  assert.match(v070, /\.selo-nao-bate \{[^}]*background: var\(--warn-soft\);[^}]*color: var\(--warn\);/);
  for (const [texto, fundo] of [["--ok", "--ok-soft"], ["--warn", "--warn-soft"], ["--ink-2", "--brand-soft"]]) {
    const razao = contraste(token(texto), token(fundo));
    assert.ok(razao >= 4.5, `${texto} sobre ${fundo}: ${razao.toFixed(2)}:1`);
  }
});
