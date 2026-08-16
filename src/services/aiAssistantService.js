import { apiRequest } from "./apiClient";

function trimText(value, max = 1200) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
  if (!product) return null;

  const context = {
    barcode: trimText(product.code || product.barcode, 64),
    name: trimText(product.product_name_pt || product.product_name || product.product_name_en || product.name, 160),
    brand: trimText(product.brands || product.brand, 120),
    ingredients: trimText(
      product.ingredients_text_pt || product.ingredients_text || product.ingredients_text_en || product.ingredients,
      1600,
    ),
    ingredients_text_pt: trimText(product.ingredients_text_pt, 1600),
    ingredients_text: trimText(product.ingredients_text, 1600),
    ingredients_text_en: trimText(product.ingredients_text_en, 1600),
    allergens: asArray(product.allergens).slice(0, 30),
    allergens_tags: asArray(product.allergens_tags).slice(0, 30),
    traces: asArray(product.traces).slice(0, 30),
    traces_tags: asArray(product.traces_tags).slice(0, 30),
    labels: asArray(product.labels).slice(0, 30),
    labels_tags: asArray(product.labels_tags).slice(0, 30),
    nutriments: pickNutriments(product.nutriments || {}),
    nutriscore: trimText(product.nutriscore_grade || product.nutriscore, 16),
    quantity: trimText(product.quantity, 80),
    servingSize: trimText(product.serving_size || product.servingSize, 80),
  };

  const hasData = Object.values(context).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  });

  return hasData ? context : null;
}

export function buildAssistantConversation(messages) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      text: trimText(message.text, 1200),
    }));
}

export function askAiAssistant({ message, conversation, product, guestAllergies }) {
  return apiRequest("/api/assistant/chat", {
    method: "POST",
    body: {
      message,
      conversation: buildAssistantConversation(conversation),
      product: buildAssistantProductContext(product),
      guestAllergies,
    },
    timeoutMs: 25000,
  });
}
