import { NUTRIENTS } from "../data/foods.js";
import { formatNumber } from "./formatting.js";

const SODIUM_UNIT_TO_MG = { mg: 1, g: 1000, mcg: 0.001, "µg": 0.001, ug: 0.001 };

export function toSodiumMg(amount, unit) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return null;
  const factor = SODIUM_UNIT_TO_MG[String(unit || "g").toLowerCase()] ?? 1000;
  return number * factor;
}

export function getNutrientRows(nutriments) {
  const source = nutriments || {};

  return NUTRIENTS.map((nutrient) => {
    const amount =
      source[`${nutrient.key}_100g`] ??
      source[nutrient.key] ??
      source[`${nutrient.key}_value`];

    if (nutrient.key === "sodium") {
      return {
        ...nutrient,
        amount: formatNumber(toSodiumMg(amount, source.sodium_unit)),
        unit: "mg",
      };
    }

    return {
      ...nutrient,
      amount: formatNumber(amount),
      unit: source[`${nutrient.key}_unit`] || nutrient.unit,
    };
  }).filter((row) => row.amount !== null);
}

export function getNutrientValue(product, key) {
  const nutriments = product?.nutriments || {};
  const value = nutriments[`${key}_100g`] ?? nutriments[key] ?? nutriments[`${key}_value`];

  if (key === "sodium") return toSodiumMg(value, nutriments.sodium_unit);

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getNutriScore(product) {
  const score = product?.nutriscore_grade || product?.nutrition_grades;
  const normalized = score ? String(score).toLowerCase() : "";
  return ["a", "b", "c", "d", "e"].includes(normalized) ? normalized.toUpperCase() : "N/A";
}

export function getNutriScoreClass(product) {
  const score = getNutriScore(product).toLowerCase();
  return ["a", "b", "c", "d", "e"].includes(score) ? score : "unknown";
}

export function getNutritionScore(product, profileRisks) {
  if (!product) return { label: "Sem análise", tone: "neutral", notes: [] };

  const kcal = getNutrientValue(product, "energy-kcal");
  const sugars = getNutrientValue(product, "sugars");
  const sodium = getNutrientValue(product, "sodium");
  const proteins = getNutrientValue(product, "proteins");
  const notes = [];
  let score = 78;

  if (profileRisks.length) {
    score -= 35;
    notes.push("Conflito com alergias do perfil.");
  }
  if (sugars !== null && sugars > 15) {
    score -= 15;
    notes.push("Açúcar elevado por 100 g.");
  }
  if (sodium !== null && sodium > 400) {
    score -= 10;
    notes.push("Sódio alto por 100 g.");
  }
  if (kcal !== null && kcal > 350) {
    score -= 8;
    notes.push("Alta densidade calórica.");
  }
  if (proteins !== null && proteins >= 10) {
    score += 8;
    notes.push("Boa presença de proteínas.");
  }

  if (score >= 75) return { label: "Boa escolha", tone: "good", notes };
  if (score >= 50) return { label: "Atenção moderada", tone: "warn", notes };
  return { label: "Requer cuidado", tone: "danger", notes };
}
