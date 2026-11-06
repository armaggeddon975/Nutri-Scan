import { FAIXAS_TACO } from "../data/faixasTaco.js";
import { getNutrientValue } from "./nutrition.js";

// Confere se os numeros da tabela cabem no que e normal para o TIPO de produto,
// pela TACO (src/data/faixasTaco.js). Pega o que as contas internas nao pegam:
// uma tabela coerente consigo mesma, mas de outra coisa - medido em 06/11/2026,
// achocolatado e leite em po com os numeros do produto PREPARADO (86 kcal por
// "100 g" de Nescau, quando o po tem 380) e maionese com zero de saturada.
//
// As faixas sao largas de proposito: produto light, outra marca e outra receita
// tem de passar. So o erro grosseiro cai fora.

const ITENS = [
  { chave: "kcal", base: "energy-kcal", sujeito: "a energia", plural: false },
  { chave: "carboidratos", base: "carbohydrates", sujeito: "os carboidratos", plural: true },
  { chave: "proteinas", base: "proteins", sujeito: "as proteínas", plural: true },
  { chave: "gorduras", base: "fat", sujeito: "as gorduras totais", plural: true },
  { chave: "saturadas", base: "saturated-fat", sujeito: "as gorduras saturadas", plural: true },
];

// Uma frase por sentido, nao uma por item: no Toddy com a coluna do preparado
// eram quatro frases seguidas, demais para quem le devagar.
function frase(itens, sentido, nomeDoTipo) {
  if (!itens.length) return null;
  const sujeitos = itens.map((item) => item.sujeito);
  const lista = sujeitos.length === 1 ? sujeitos[0] : `${sujeitos.slice(0, -1).join(", ")} e ${sujeitos.at(-1)}`;
  const verbo = itens.length > 1 || itens[0].plural ? "estão" : "está";
  return `${lista[0].toUpperCase()}${lista.slice(1)} ${verbo} muito ${sentido} do normal para ${nomeDoTipo}.`;
}

export const LIMITES_DA_FAIXA = {
  energiaAbaixoDe: 0.4, // menos de 40% da menor referencia
  energiaAcimaDe: 1.6, // mais de 160% da maior
  gramasAbaixoDe: 1 / 3, // menos de um terco da menor referencia...
  referenciaMinimaParaOPiso: 1, // ...so quando ela tem pelo menos 1 g
  gramasAcimaFator: 2, // mais que o dobro da maior...
  gramasAcimaFolga: 3, // ...mais 3 g
};

export function tipoDoProduto(product) {
  const tags = new Set((product?.categories_tags || []).map((tag) => String(tag).toLowerCase().trim()));
  if (!tags.size) return null;
  return (
    FAIXAS_TACO.find(({ categorias }) => {
      if (categorias.exceto?.some((tag) => tags.has(tag))) return false;
      if (categorias.qualquer?.some((tag) => tags.has(tag))) return true;
      const ou = categorias.ou;
      return Boolean(ou && ou.umaDe.some((tag) => tags.has(tag)) && ou.eUmaDe.some((tag) => tags.has(tag)));
    }) || null
  );
}

export function conferirFaixaDoTipo(product) {
  const tipo = tipoDoProduto(product);
  if (!tipo) return { tipo: null, problemas: [] };

  const abaixo = [];
  const acima = [];
  for (const item of ITENS) {
    const valor = getNutrientValue(product, item.base);
    if (valor === null) continue;
    const referencias = tipo.referencias.map((r) => r[item.chave]).filter((v) => typeof v === "number");
    if (!referencias.length) continue;
    const menor = Math.min(...referencias);
    const maior = Math.max(...referencias);
    let piso;
    let teto;
    if (item.chave === "kcal") {
      piso = menor * LIMITES_DA_FAIXA.energiaAbaixoDe;
      teto = maior * LIMITES_DA_FAIXA.energiaAcimaDe;
    } else {
      piso = menor >= LIMITES_DA_FAIXA.referenciaMinimaParaOPiso ? menor * LIMITES_DA_FAIXA.gramasAbaixoDe : null;
      teto = maior * LIMITES_DA_FAIXA.gramasAcimaFator + LIMITES_DA_FAIXA.gramasAcimaFolga;
    }
    if (piso !== null && valor < piso) abaixo.push(item);
    else if (valor > teto) acima.push(item);
  }
  const problemas = [frase(abaixo, "abaixo", tipo.nome), frase(acima, "acima", tipo.nome)].filter(Boolean);
  return { tipo: tipo.chave, problemas };
}
