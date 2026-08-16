import { filterValidAllergies } from "../config/allergies.js";
import { analyzeProductAllergens } from "../../../shared/allergenEngine.js";
import { trimText } from "./safety.js";

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProductName(product = {}) {
  return trimText(product.name || product.product_name || product.product_name_pt || product.product_name_en, 160);
}

function getProductBrand(product = {}) {
  return trimText(product.brand || product.brands, 120);
}

function getIngredients(product = {}) {
  return trimText(
    product.ingredients ||
      product.ingredients_text_pt ||
      product.ingredients_text ||
      product.ingredients_text_en,
    1600,
  );
}

function pickNutriments(nutriments = {}) {
  const keys = [
    "energy-kcal",
    "energy-kcal_100g",
    "proteins",
    "proteins_100g",
    "carbohydrates",
    "carbohydrates_100g",
    "sugars",
    "sugars_100g",
    "fat",
    "fat_100g",
    "saturated-fat",
    "saturated-fat_100g",
    "sodium",
    "sodium_100g",
    "salt",
    "salt_100g",
    "fiber",
    "fiber_100g",
  ];

  return Object.fromEntries(
    keys
      .filter((key) => nutriments[key] !== undefined && nutriments[key] !== null)
      .map((key) => [key, nutriments[key]]),
  );
}

export function buildAssistantProductContext(product) {
  if (!product || typeof product !== "object") return null;

  const context = {
    barcode: trimText(product.barcode || product.code, 64),
    name: getProductName(product),
    brand: getProductBrand(product),
    ingredients: getIngredients(product),
    ingredients_text_pt: trimText(product.ingredients_text_pt, 1600),
    ingredients_text: trimText(product.ingredients_text, 1600),
    ingredients_text_en: trimText(product.ingredients_text_en, 1600),
    allergens: asArray(product.allergens).slice(0, 30),
    allergens_tags: asArray(product.allergens_tags || product.allergenTags).slice(0, 30),
    traces: asArray(product.traces).slice(0, 30),
    traces_tags: asArray(product.traces_tags || product.traceTags).slice(0, 30),
    labels: asArray(product.labels).slice(0, 30),
    labels_tags: asArray(product.labels_tags || product.labelTags).slice(0, 30),
    nutriments: pickNutriments(product.nutriments || {}),
    nutriscore: trimText(product.nutriscore || product.nutriscore_grade, 16),
    quantity: trimText(product.quantity, 80),
    servingSize: trimText(product.servingSize || product.serving_size, 80),
  };

  const hasData = Object.entries(context).some(([key, value]) => {
    if (key === "nutriments") return Object.keys(value).length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });

  return hasData ? context : null;
}

export function buildAllergySnapshot(productContext, profileAllergies) {
  const validProfileAllergies = filterValidAllergies(profileAllergies);
  const scan = analyzeProductAllergens(productContext, validProfileAllergies);
  const profileRisks = scan.profileRisks || [];
  const detectedConflicts = profileRisks
    .filter((risk) => risk.severity === "contains")
    .map((risk) => risk.id);
  const possibleTraces = profileRisks
    .filter((risk) => risk.severity === "traces")
    .map((risk) => risk.id);

  return {
    profileAllergies: validProfileAllergies,
    detectedConflicts,
    possibleTraces,
    hasDeclaredConflict: detectedConflicts.length > 0,
    hasTraceConflict: possibleTraces.length > 0,
    hasProductContext: Boolean(productContext),
    allRisks: scan.allRisks.map((risk) => ({
      id: risk.id,
      label: risk.label,
      severity: risk.severity,
    })),
    profileRisks: profileRisks.map((risk) => ({
      id: risk.id,
      label: risk.label,
      severity: risk.severity,
    })),
  };
}

export function buildAssistantContext({ product, allergies }) {
  const productContext = buildAssistantProductContext(product);
  const allergySnapshot = buildAllergySnapshot(productContext, allergies);
  return {
    product: productContext,
    allergySnapshot,
  };
}
