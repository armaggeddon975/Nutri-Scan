import { readFileSync } from "node:fs";
import path from "node:path";

import { rootDir } from "./common.js";
import { avaliarTabelaNutricional } from "../src/utils/confiancaDaTabela.js";
import { getNutrientValue } from "../src/utils/nutrition.js";

// npm run medir:tabelas
//
// Mede a tabela nutricional que a Open Food Facts guarda (e que o app mostra
// por 100 g) contra a tabela da FOTO do rotulo, item por item, e confere o selo
// de confianca contra o resultado. Roda sem rede, sobre medicao/tabelas-com-foto.json.
//
// A leitura das fotos foi feita por Claude (uma IA lendo a imagem), nao por
// uma pessoa: cada produto guarda o endereco da foto, para conferencia humana.
// Isto e medicao de dado, nao validacao nutricional.

const ITENS = [
  // chave da leitura, chave da base, nome, folga minima, meia unidade do rotulo
  ["kcal", "energy-kcal", "energia", 5, 1],
  ["carboidratos", "carbohydrates", "carboidratos", 0.5, 0.1],
  ["acucares", "sugars", "açúcares", 0.5, 0.1],
  ["proteinas", "proteins", "proteínas", 0.5, 0.1],
  ["gorduras", "fat", "gorduras totais", 0.5, 0.1],
  ["saturadas", "saturated-fat", "gorduras saturadas", 0.5, 0.1],
  ["fibras", "fiber", "fibras", 0.5, 0.1],
  ["sodio_mg", "sodium", "sódio", 10, 1],
];

// Folga: 10% do maior valor, ou o arredondamento do rotulo multiplicado pela
// conversao da porcao para 100 g (0,1 g numa porcao de 20 g vira 0,5 g), ou a
// folga minima - o que for maior.
function comparar(produto) {
  const rotulo = produto.rotulo;
  const fator = rotulo.coluna === "porcao" ? 100 / rotulo.porcao_g : 1;
  const sodioDoRotulo = rotulo.sodio_mg ?? (rotulo.sal === undefined ? undefined : rotulo.sal * 400);
  const daBase = { nutriments: produto.base };
  return ITENS.map(([chave, chaveBase, nome, piso, meia]) => {
    const bruto = chave === "sodio_mg" ? sodioDoRotulo : rotulo[chave];
    const foto = bruto === undefined ? null : bruto * fator;
    const base = getNutrientValue(daBase, chaveBase);
    let estado;
    if (foto === null && base === null) estado = "ausente nos dois";
    else if (foto === null) estado = "falta na foto";
    else if (base === null) estado = "falta na base";
    else {
      const folga = Math.max(piso, meia * fator, 0.1 * Math.max(Math.abs(foto), Math.abs(base)));
      estado = Math.abs(foto - base) <= folga ? "confere" : "diverge";
    }
    return { nome, foto, base, estado };
  });
}

const fmt = (n) => (n === null ? "-" : String(Math.round(n * 100) / 100).replace(".", ","));

function main() {
  const conjunto = JSON.parse(readFileSync(path.join(rootDir, "medicao", "tabelas-com-foto.json"), "utf8"));
  const porItem = Object.fromEntries(ITENS.map(([, , nome]) => [nome, { confere: 0, diverge: 0, "falta na base": 0 }]));
  const situacoes = { fiel: [], lacuna: [], "numero errado": [] };
  const fora = [];
  const seloXRealidade = {};

  for (const produto of conjunto.produtos) {
    if (produto.rotulo.semTabela) {
      fora.push(produto);
      continue;
    }
    const linhas = comparar(produto);
    for (const linha of linhas) if (porItem[linha.nome][linha.estado] !== undefined) porItem[linha.nome][linha.estado] += 1;
    const situacao = linhas.some((l) => l.estado === "diverge") ? "numero errado" : linhas.some((l) => l.estado === "falta na base") ? "lacuna" : "fiel";
    const selo = avaliarTabelaNutricional({ nutriments: produto.base, categories_tags: produto.categorias }).estado;
    situacoes[situacao].push({ produto, linhas, selo });
    const chave = `selo ${selo.padEnd(10)} | base ${situacao}`;
    seloXRealidade[chave] = (seloXRealidade[chave] || 0) + 1;
  }

  const medidos = Object.values(situacoes).reduce((s, l) => s + l.length, 0);
  const saida = [
    "MEDICAO DA TABELA NUTRICIONAL CONTRA A FOTO DO ROTULO",
    "Leitura das fotos por Claude (IA), conferivel pelo endereco de cada foto. Nao e validacao nutricional.",
    `conjunto: ${conjunto.produtos.length} produtos (${conjunto.selecao}); ${medidos} com a tabela legivel na foto; fora: ${fora.map((p) => `${p.codigo} (${p.rotulo.notas})`).join("; ") || "nenhum"}`,
    "",
    "por produto:",
    `  base fiel a foto        ${situacoes.fiel.length}`,
    `  base com lacuna         ${situacoes.lacuna.length}  (a foto tem o numero, a base nao)`,
    `  base com numero errado  ${situacoes["numero errado"].length}`,
    "",
    "por item (os 8 que o selo confere):",
    "  item                 confere  diverge  falta na base",
    ...Object.entries(porItem).map(([nome, c]) => `  ${nome.padEnd(20)} ${String(c.confere).padStart(7)} ${String(c.diverge).padStart(8)} ${String(c["falta na base"]).padStart(14)}`),
    "",
    "numeros errados (base x foto, por 100 g ou 100 ml):",
    ...situacoes["numero errado"].map(({ produto, linhas, selo }) =>
      `  ${produto.codigo.padEnd(14)} ${produto.nome.slice(0, 28).padEnd(28)} selo: ${selo.padEnd(10)} ${linhas.filter((l) => l.estado === "diverge").map((l) => `${l.nome} ${fmt(l.base)} x ${fmt(l.foto)}`).join("; ")}`,
    ),
    "",
    "lacunas (a foto tem, a base nao):",
    ...situacoes.lacuna.map(({ produto, linhas, selo }) =>
      `  ${produto.codigo.padEnd(14)} ${produto.nome.slice(0, 28).padEnd(28)} selo: ${selo.padEnd(10)} falta: ${linhas.filter((l) => l.estado === "falta na base").map((l) => l.nome).join(", ")}`,
    ),
    "",
    "selo de hoje x o que a foto mostra:",
    ...Object.entries(seloXRealidade).sort().map(([chave, n]) => `  ${chave.padEnd(40)} ${n}`),
  ];
  console.log(saida.join("\n"));
}

main();
