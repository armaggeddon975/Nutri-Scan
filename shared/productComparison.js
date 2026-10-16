// Comparacao de dois produtos (v0.10.0).
//
// O MESMO modulo roda no backend (rota /api/compare) e no frontend (quando o
// servidor nao responde). Ele so MOSTRA os dois lado a lado e as diferencas
// entre eles, calculadas aqui, por codigo. Ele NAO elege vencedor: nao existe
// campo de "melhor", "recomendado" ou "mais seguro", e a ordem dos produtos e
// a ordem em que a pessoa os escolheu - nunca uma ordenacao por qualidade.
//
// UM VEREDITO POR PRODUTO, CALCULADO SOZINHO
//
// Cada produto passa por `analyzeComparedProduct` numa chamada propria, que so
// recebe aquele produto e o perfil. Nada do outro produto entra no calculo, e
// nao existe veredito "da comparacao". O piso de risco de cada um sai do
// veredito dele.
//
// "NAO INFORMADO" NAO E "NAO CONTEM"
//
// Produto sem dado de alergenico fica `not_informed` - nunca `not_detected` - e
// o veredito dele sai `not_evaluated` com motivo `no_allergen_data`, e nao
// `clear`. Nutriente que a base nao traz fica `null` - nunca 0.

import { analyzeProductAllergens } from "./allergenEngine.js";
import { ALLERGY_DEFINITIONS } from "./allergens.js";
import { buildAllergyVerdict, PROFILE_SOURCE } from "./allergyVerdict.js";

export const COMPARISON_SLOTS = ["a", "b"];

export const ALLERGEN_STATE = {
  contains: "contains",
  traces: "traces",
  notDetected: "not_detected",
  notInformed: "not_informed",
};

export const ALLERGEN_DATA = { informed: "informed", notInformed: "not_informed" };

// Os mesmos nutrientes, rotulos e unidades da tela do produto. Valor por 100 g
// (ou 100 ml), que e o que a base normaliza e o que torna dois produtos
// comparaveis.
export const COMPARED_NUTRIENTS = [
  { key: "energy-kcal", label: "Energia", unit: "kcal" },
  { key: "fat", label: "Gorduras totais", unit: "g" },
  { key: "saturated-fat", label: "Gorduras saturadas", unit: "g" },
  { key: "carbohydrates", label: "Carboidratos", unit: "g" },
  { key: "sugars", label: "Açúcares", unit: "g" },
  { key: "fiber", label: "Fibras", unit: "g" },
  { key: "proteins", label: "Proteínas", unit: "g" },
  { key: "salt", label: "Sal", unit: "g" },
  { key: "sodium", label: "Sódio", unit: "mg" },
];

const ORDEM_DOS_ALERGENICOS = new Map(ALLERGY_DEFINITIONS.map((definicao, indice) => [definicao.id, indice]));

// Numero informado, ou `null`. `null`, `undefined`, texto vazio e texto que
// nao e numero NAO viram 0: 0 e um valor que a base declarou, ausencia e
// ausencia.
export function informedNumber(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  const numero = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

// Valor por 100 g. O sodio da base, por 100 g, vem em gramas; a tela mostra mg.
export function readNutrient(nutriments, key) {
  const valor = informedNumber(nutriments?.[`${key}_100g`]);
  if (valor === null) return null;
  return key === "sodium" ? Math.round(valor * 1000 * 100) / 100 : valor;
}

function texto(valor, limite) {
  return String(valor ?? "").trim().slice(0, limite);
}

function nomeDo(produto) {
  return texto(produto?.name || produto?.product_name_pt || produto?.product_name || produto?.product_name_en, 160);
}

function marcaDo(produto) {
  return texto(produto?.brand || produto?.brands, 120);
}

/**
 * Um produto, sozinho. Recebe SO este produto e o perfil.
 *
 * @param {object|null} product   o produto como veio da busca (dado NAO confiavel)
 * @param {object} perfil         { profileAllergies, alertLevels, profileSource }
 */
export function analyzeComparedProduct(
  product,
  { profileAllergies = [], alertLevels = {}, profileSource = PROFILE_SOURCE.request } = {},
) {
  const scan = analyzeProductAllergens(product, profileAllergies);
  const informado = Boolean(product) && scan.hasData;

  const allergyVerdict = buildAllergyVerdict({
    profileRisks: scan.profileRisks,
    profileAllergies,
    hasProductContext: Boolean(product),
    profileSource,
    alertLevels,
    allergenDataAvailable: informado,
  });

  return {
    name: nomeDo(product),
    brand: marcaDo(product),
    allergenData: informado ? ALLERGEN_DATA.informed : ALLERGEN_DATA.notInformed,
    // Todo alergenico que o motor achou no rotulo - nao so os do perfil. Sem
    // dado, a lista e vazia E `allergenData` diz `not_informed`: quem le
    // precisa dos dois para nao confundir "nada achado" com "nada informado".
    allergens: informado
      ? scan.allRisks.map((risk) => ({ id: risk.id, label: risk.label, state: risk.severity }))
      : [],
    nutrition: COMPARED_NUTRIENTS.map((nutriente) => ({
      ...nutriente,
      value: readNutrient(product?.nutriments, nutriente.key),
    })),
    allergyVerdict,
  };
}

function estadoDoAlergenico(lado, id) {
  if (lado.allergenData === ALLERGEN_DATA.notInformed) return ALLERGEN_STATE.notInformed;
  return lado.allergens.find((alergenico) => alergenico.id === id)?.state ?? ALLERGEN_STATE.notDetected;
}

/**
 * As diferencas entre os dois, calculadas aqui. Nenhum juizo: so o que um tem
 * e o outro nao, e os valores lado a lado.
 */
export function buildDifferences(a, b) {
  const rotulos = new Map([...a.allergens, ...b.allergens].map((alergenico) => [alergenico.id, alergenico.label]));
  const ids = [...rotulos.keys()].sort(
    (x, y) => (ORDEM_DOS_ALERGENICOS.get(x) ?? 9999) - (ORDEM_DOS_ALERGENICOS.get(y) ?? 9999),
  );

  const allergens = ids
    .map((id) => ({ id, label: rotulos.get(id), a: estadoDoAlergenico(a, id), b: estadoDoAlergenico(b, id) }))
    .filter((linha) => linha.a !== linha.b);

  const nutrition = COMPARED_NUTRIENTS.map((nutriente, indice) => ({
    key: nutriente.key,
    label: nutriente.label,
    unit: nutriente.unit,
    a: a.nutrition[indice].value,
    b: b.nutrition[indice].value,
  })).filter((linha) => linha.a !== null || linha.b !== null);

  return { allergens, nutrition };
}

/**
 * Dois produtos, na ordem em que a pessoa os escolheu.
 *
 * @param {Array<{code: string, product: object}>} entradas  exatamente duas
 * @param {object} perfil  { profileAllergies, alertLevels, profileSource }
 */
export function compareProducts([entradaA, entradaB], perfil = {}) {
  const ladoA = analyzeComparedProduct(entradaA.product, perfil);
  const ladoB = analyzeComparedProduct(entradaB.product, perfil);

  return {
    profileSource: perfil.profileSource ?? PROFILE_SOURCE.request,
    products: [
      { slot: COMPARISON_SLOTS[0], code: entradaA.code, ...ladoA },
      { slot: COMPARISON_SLOTS[1], code: entradaB.code, ...ladoB },
    ],
    differences: buildDifferences(ladoA, ladoB),
  };
}
