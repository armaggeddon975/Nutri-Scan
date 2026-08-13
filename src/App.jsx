import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, NotFoundException } from "@zxing/library";
import {
  AlertCircle,
  Barcode,
  Bot,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleGauge,
  ClipboardList,
  Home,
  Leaf,
  Lock,
  LogIn,
  LogOut,
  Loader2,
  Mail,
  MessageSquareText,
  Search,
  ShieldAlert,
  Sparkles,
  Utensils,
  User,
  UserPlus,
} from "lucide-react";

const API_BASE = "https://world.openfoodfacts.org/api/v3/product";
const PRODUCT_FIELDS = [
  "code",
  "product_name",
  "product_name_pt",
  "product_name_en",
  "brands",
  "quantity",
  "image_front_url",
  "ingredients_text",
  "ingredients_text_pt",
  "ingredients_text_en",
  "nutriments",
  "nutriscore_grade",
  "nutrition_grades",
  "nutrition_data_per",
  "serving_size",
  "allergens_tags",
  "labels_tags",
  "categories_tags",
].join(",");

const NUTRIENTS = [
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

const ALLERGY_OPTIONS = [
  {
    id: "milk",
    label: "Leite/lactose",
    terms: [
      "leite",
      "lactose",
      "whey",
      "caseina",
      "caseína",
      "milk",
      "soro de leite",
      "leite em pó",
      "leite em po",
      "proteína do leite",
      "proteina do leite",
      "derivados de leite",
      "lácteo",
      "lacteo",
      "creme de leite",
      "manteiga",
    ],
  },
  {
    id: "gluten",
    label: "Glúten",
    terms: [
      "gluten",
      "glúten",
      "trigo",
      "farinha de trigo",
      "cevada",
      "centeio",
      "aveia",
      "malte",
      "celíaco",
      "celiaco",
    ],
  },
  {
    id: "peanut",
    label: "Amendoim",
    terms: ["amendoim", "peanut"],
  },
  {
    id: "nuts",
    label: "Castanhas",
    terms: ["castanha", "amendoa", "amêndoa", "avelã", "nozes", "nuts", "hazelnut"],
  },
  {
    id: "soy",
    label: "Soja",
    terms: ["soja", "soy", "lecitina de soja", "proteína de soja", "proteina de soja"],
  },
  {
    id: "egg",
    label: "Ovo",
    terms: ["ovo", "clara", "gema", "albumina", "ovo em pó", "ovo em po", "egg"],
  },
];

const LOCAL_FOODS = [
  {
    id: "arroz-branco",
    name: "Arroz branco cozido",
    category: "Comida brasileira",
    serving: "100 g",
    aliases: ["arroz", "arroz branco"],
    ingredients: "Arroz branco, água e sal opcional.",
    tags: ["sem glúten", "sem lactose", "base local"],
    allergens: [],
    nutriments: {
      "energy-kcal_100g": 128,
      carbohydrates_100g: 28.1,
      proteins_100g: 2.5,
      fat_100g: 0.2,
      fiber_100g: 1.6,
      sodium_100g: 1,
    },
    insight: "Boa fonte de carboidrato simples para refeições principais.",
  },
  {
    id: "feijao-carioca",
    name: "Feijão carioca cozido",
    category: "Comida brasileira",
    serving: "100 g",
    aliases: ["feijao", "feijão", "feijão carioca"],
    ingredients: "Feijão carioca, água, alho, cebola, sal e temperos.",
    tags: ["fonte de fibras", "sem lactose", "base local"],
    allergens: [],
    nutriments: {
      "energy-kcal_100g": 76,
      carbohydrates_100g: 13.6,
      proteins_100g: 4.8,
      fat_100g: 0.5,
      fiber_100g: 8.5,
      sodium_100g: 2,
    },
    insight: "Entrega fibras e proteína vegetal; combina bem com arroz.",
  },
  {
    id: "frango-grelhado",
    name: "Peito de frango grelhado",
    category: "Proteína",
    serving: "100 g",
    aliases: ["frango", "peito de frango", "frango grelhado"],
    ingredients: "Peito de frango, sal e temperos.",
    tags: ["alto em proteínas", "baixo carboidrato", "base local"],
    allergens: [],
    nutriments: {
      "energy-kcal_100g": 165,
      carbohydrates_100g: 0,
      proteins_100g: 31,
      fat_100g: 3.6,
      sodium_100g: 74,
    },
    insight: "Opção proteica magra, útil para montar refeições mais saciantes.",
  },
  {
    id: "banana-prata",
    name: "Banana prata",
    category: "Fruta",
    serving: "1 unidade média",
    aliases: ["banana", "banana prata"],
    ingredients: "Banana prata in natura.",
    tags: ["fruta", "sem glúten", "sem lactose", "base local"],
    allergens: [],
    nutriments: {
      "energy-kcal_100g": 98,
      carbohydrates_100g: 26,
      proteins_100g: 1.3,
      fat_100g: 0.1,
      fiber_100g: 2,
      sugars_100g: 14.4,
      sodium_100g: 1,
    },
    insight: "Boa opção prática antes de treino ou como lanche rápido.",
  },
  {
    id: "pao-frances",
    name: "Pão francês",
    category: "Padaria",
    serving: "1 unidade",
    aliases: ["pao", "pão", "pão francês", "cacetinho"],
    ingredients: "Farinha de trigo, água, fermento, sal e melhoradores.",
    tags: ["contém glúten", "base local"],
    allergens: ["gluten"],
    nutriments: {
      "energy-kcal_100g": 300,
      carbohydrates_100g: 58.6,
      proteins_100g: 8,
      fat_100g: 3.1,
      fiber_100g: 2.3,
      sodium_100g: 648,
    },
    insight: "Tem glúten e costuma ter sódio relevante; vale observar porção.",
  },
  {
    id: "leite-integral",
    name: "Leite integral",
    category: "Laticínio",
    serving: "200 ml",
    aliases: ["leite", "leite integral"],
    ingredients: "Leite integral pasteurizado.",
    tags: ["contém lactose", "base local"],
    allergens: ["milk"],
    nutriments: {
      "energy-kcal_100g": 61,
      carbohydrates_100g: 4.7,
      sugars_100g: 4.7,
      proteins_100g: 3.2,
      fat_100g: 3.3,
      sodium_100g: 43,
    },
    insight: "Contém lactose e proteína do leite; importante para perfis sensíveis.",
  },
  {
    id: "ovo-cozido",
    name: "Ovo cozido",
    category: "Proteína",
    serving: "1 unidade",
    aliases: ["ovo", "ovo cozido"],
    ingredients: "Ovo de galinha.",
    tags: ["fonte de proteínas", "base local"],
    allergens: ["egg"],
    nutriments: {
      "energy-kcal_100g": 155,
      carbohydrates_100g: 1.1,
      proteins_100g: 13,
      fat_100g: 10.6,
      sodium_100g: 124,
    },
    insight: "Boa densidade proteica, mas deve ser evitado por quem tem alergia a ovo.",
  },
  {
    id: "iogurte-natural",
    name: "Iogurte natural integral",
    category: "Laticínio",
    serving: "170 g",
    aliases: ["iogurte", "iogurte natural"],
    ingredients: "Leite integral e fermento lácteo.",
    tags: ["contém lactose", "base local"],
    allergens: ["milk"],
    nutriments: {
      "energy-kcal_100g": 68,
      carbohydrates_100g: 4.7,
      sugars_100g: 4.7,
      proteins_100g: 3.5,
      fat_100g: 3.7,
      sodium_100g: 46,
    },
    insight: "Tem lactose; versões sem açúcar podem ser melhores no dia a dia.",
  },
];

const SAMPLE_QUERIES = ["arroz", "feijão", "frango", "banana", "pão", "leite"];
const SAMPLE_BARCODES = [
  { label: "Nutella", code: "3017624010701" },
  { label: "Coca-Cola", code: "5449000000996" },
  { label: "Nescau", code: "7891000100103" },
];

const DEFAULT_ALLERGIES = ["milk", "gluten"];
const USERS_STORAGE_KEY = "nutriscan:users";
const SESSION_STORAGE_KEY = "nutriscan:session";
const GUEST_ALLERGIES_KEY = "nutriscan:guest-allergies";

const hints = new Map([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.ITF,
    ],
  ],
]);

function readStoredUsers() {
  try {
    const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
    const users = rawUsers ? JSON.parse(rawUsers) : [];
    return Array.isArray(users) ? users : [];
  } catch {
    return [];
  }
}

function writeStoredUsers(users) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function readStoredAllergies() {
  try {
    const rawAllergies = localStorage.getItem(GUEST_ALLERGIES_KEY);
    const allergies = rawAllergies ? JSON.parse(rawAllergies) : DEFAULT_ALLERGIES;
    return Array.isArray(allergies) ? allergies : DEFAULT_ALLERGIES;
  } catch {
    return DEFAULT_ALLERGIES;
  }
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    allergies: user.allergies || [],
    createdAt: user.createdAt,
  };
}

function findUserByIdentifier(users, identifier) {
  const normalizedIdentifier = normalizeText(identifier);
  return users.find(
    (user) =>
      normalizeText(user.email) === normalizedIdentifier ||
      normalizeText(user.name) === normalizedIdentifier,
  );
}

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeIntentText(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBarcode(value = "") {
  return value.replace(/[^\d]/g, "").slice(0, 18);
}

function isBarcodeQuery(value) {
  return /^\d{6,18}$/.test(cleanBarcode(value));
}

function toLocalProduct(food) {
  return {
    ...food,
    code: food.id,
    product_name_pt: food.name,
    brands: food.category,
    quantity: food.serving,
    ingredients_text_pt: food.ingredients,
    nutriments: {
      ...food.nutriments,
      sodium_unit: "mg",
    },
    labels_tags: food.tags,
    allergens_tags: food.allergens,
    source: "Base brasileira local",
    localInsight: food.insight,
    isLocal: true,
  };
}

function getProductName(product) {
  return (
    product?.product_name_pt ||
    product?.product_name ||
    product?.product_name_en ||
    "Produto sem nome"
  );
}

function getIngredients(product) {
  return (
    product?.ingredients_text_pt ||
    product?.ingredients_text ||
    product?.ingredients_text_en ||
    product?.ingredients ||
    ""
  );
}

function formatNumber(value) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: number < 1 ? 3 : 1,
  }).format(number);
}

function getNutrientRows(nutriments = {}) {
  return NUTRIENTS.map((nutrient) => {
    const amount =
      nutriments[`${nutrient.key}_100g`] ??
      nutriments[nutrient.key] ??
      nutriments[`${nutrient.key}_value`];
    const originalUnit = nutriments[`${nutrient.key}_unit`] || nutrient.unit;
    const shouldConvertSodium =
      nutrient.key === "sodium" && originalUnit !== "mg" && Number(amount) < 10;
    const displayAmount = shouldConvertSodium ? Number(amount) * 1000 : amount;
    const unit = nutrient.key === "sodium" ? "mg" : originalUnit;

    return {
      ...nutrient,
      amount: formatNumber(displayAmount),
      unit,
    };
  }).filter((row) => row.amount !== null);
}

function getNutrientValue(product, key) {
  const value =
    product?.nutriments?.[`${key}_100g`] ??
    product?.nutriments?.[key] ??
    product?.nutriments?.[`${key}_value`];
  if (!Number.isFinite(Number(value))) return null;

  if (key === "sodium") {
    const unit = product?.nutriments?.sodium_unit || "g";
    return unit !== "mg" && Number(value) < 10 ? Number(value) * 1000 : Number(value);
  }

  return Number(value);
}

function formatTag(tag = "") {
  const cleanTag = tag
    .replace(/^[a-z]{2}:/, "")
    .replaceAll("-", " ");

  return cleanTag
    .split(" ")
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1))
    .join(" ");
}

function getNutriScore(product) {
  const score = product?.nutriscore_grade || product?.nutrition_grades;
  return score ? score.toUpperCase() : "N/A";
}

function getNutriScoreClass(product) {
  const score = getNutriScore(product).toLowerCase();
  return ["a", "b", "c", "d", "e"].includes(score) ? score : "unknown";
}

function findLocalFoods(query) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  return LOCAL_FOODS.map((food) => {
    const haystack = [food.name, food.category, ...food.aliases].map(normalizeText);
    const exact = haystack.some((item) => item === normalizedQuery);
    const partial = haystack.some((item) => item.includes(normalizedQuery));
    return { food, score: exact ? 2 : partial ? 1 : 0 };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => toLocalProduct(entry.food));
}

function hasAnyTerm(query, terms) {
  const normalizedQuery = normalizeIntentText(query);

  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escapedTerm}(\\s|$)`).test(normalizedQuery);
  });
}

function hasTextIntent(query, terms) {
  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    if (normalizedTerm.length <= 3 || normalizedTerm.includes(" ")) {
      return hasAnyTerm(query, [normalizedTerm]);
    }
    return normalizeIntentText(query).includes(normalizedTerm);
  });
}

async function fetchProductByBarcode(barcode) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(barcode)}?fields=${PRODUCT_FIELDS}`,
    { headers: { Accept: "application/json" } },
  );

  if (!response.ok) {
    throw new Error("A consulta falhou. Tente novamente.");
  }

  const data = await response.json();
  if (data.status !== "success" || !data.product) return null;

  return {
    ...data.product,
    source: "Open Food Facts",
    isLocal: false,
  };
}

function scanAllergies(product, selectedAllergies) {
  if (!product) return { allRisks: [], profileRisks: [] };

  const ingredients = normalizeText(getIngredients(product));
  const tagText = normalizeText((product.allergens_tags || []).join(" "));

  const allRisks = ALLERGY_OPTIONS.filter((option) => {
    if ((product.allergens_tags || []).includes(option.id)) return true;
    return option.terms.some((term) => {
      const normalizedTerm = normalizeText(term);
      return ingredients.includes(normalizedTerm) || tagText.includes(normalizedTerm);
    });
  });

  return {
    allRisks,
    profileRisks: allRisks.filter((risk) => selectedAllergies.includes(risk.id)),
  };
}

function getNutritionScore(product, profileRisks) {
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

function getMentionedAllergies(query) {
  return ALLERGY_OPTIONS.filter((option) =>
    hasTextIntent(query, [...option.terms, option.label]),
  );
}

function getMentionedFood(query) {
  const normalizedQuery = normalizeIntentText(query);
  const foods = [
    "chocolate",
    "achocolatado",
    "barra de cereal",
    "cereal",
    "leite",
    "iogurte",
    "queijo",
    "requeijão",
    "manteiga",
    "pão",
    "bolo",
    "biscoito",
    "bolacha",
    "sorvete",
    "pizza",
    "hamburguer",
    "hambúrguer",
    "macarrão",
    "massa",
    "arroz",
    "feijão",
    "frango",
    "banana",
    "ovo",
    "amendoim",
    "castanha",
    "granola",
    "maionese",
    "molho",
    "refrigerante",
    "coca cola",
    "suco",
    "suco de caixinha",
  ];
  const matches = foods.filter((food) => hasTextIntent(normalizedQuery, [food]));
  const subjectMatch = normalizedQuery.match(/^(.+?)\s+(tem|leva|contem|possui|pode conter)\s+/);

  if (matches.length > 1 && subjectMatch) {
    const subjectFoods = matches.filter((food) =>
      hasTextIntent(subjectMatch[1], [food]),
    );
    if (subjectFoods.length) {
      return subjectFoods.sort(
        (a, b) =>
          subjectMatch[1].lastIndexOf(normalizeIntentText(b)) -
          subjectMatch[1].lastIndexOf(normalizeIntentText(a)),
      )[0];
    }
  }

  return matches
    .sort(
      (a, b) =>
        normalizedQuery.lastIndexOf(normalizeIntentText(b)) -
        normalizedQuery.lastIndexOf(normalizeIntentText(a)),
    )[0] || "";
}

function buildIngredientAdvice(food) {
  const ingredientMap = {
    chocolate:
      "Chocolate costuma ter massa de cacau, açúcar, manteiga de cacau e, dependendo do tipo, leite em pó ou soro de leite. Também pode ter emulsificante como lecitina de soja e aromatizante. O ponto importante é olhar se o rótulo diz 'contém leite', 'contém lactose', 'contém soja' ou 'pode conter amendoim/castanhas'.",
    achocolatado:
      "Achocolatado geralmente tem açúcar, cacau em pó, maltodextrina ou outros carboidratos, vitaminas/minerais adicionados e aromatizantes. Alguns podem conter leite ou traços, então vale conferir o alerta de alergênicos.",
    "barra de cereal":
      "Barra de cereal costuma ter cereais, xarope de glicose ou açúcar, aveia, arroz/cereal crocante, frutas, chocolate ou castanhas. Pode conter glúten, leite, soja, amendoim ou castanhas dependendo da marca.",
    leite:
      "Leite tem basicamente leite, mas pode variar entre integral, semidesnatado, desnatado, sem lactose ou bebida láctea. Para alergia a leite, mesmo leite sem lactose não é necessariamente seguro, porque ainda pode ter proteína do leite.",
    iogurte:
      "Iogurte geralmente tem leite e fermentos lácteos. Versões saborizadas podem ter açúcar, frutas, corantes, aromatizantes e espessantes. Para lactose/leite, precisa conferir se é sem lactose e se há proteína do leite.",
    queijo:
      "Queijo normalmente é feito de leite, fermento, sal e coalho. Para alergia a leite ou lactose, exige cuidado, porque mesmo que alguns queijos tenham menos lactose, continuam tendo proteína do leite.",
    pão:
      "Pão geralmente tem farinha de trigo, água, fermento e sal. Pode ter açúcar, gordura, leite, ovos ou melhoradores. Para glúten, trigo é o principal ponto de atenção.",
    bolo:
      "Bolo costuma ter farinha de trigo, açúcar, ovos, leite ou derivados, óleo/manteiga e fermento. É comum ter glúten, leite e ovo.",
    biscoito:
      "Biscoito costuma ter farinha, açúcar, gordura vegetal, sal, fermentos e aromatizantes. Muitos têm glúten, leite, soja ou traços de amendoim/castanhas.",
    bolacha:
      "Bolacha costuma ter farinha, açúcar, gordura vegetal, sal e aromatizantes. Muitos produtos têm glúten, leite, soja ou traços, então o rótulo manda.",
    sorvete:
      "Sorvete geralmente tem leite ou derivados, açúcar, gordura, estabilizantes e saborizantes. Para lactose ou alergia a leite, precisa de muita atenção; picolés de fruta podem ser opção, mas também precisam de rótulo.",
    pizza:
      "Pizza costuma ter massa com farinha de trigo, molho, queijo e recheios. Pode envolver glúten, leite e outros alergênicos dependendo do sabor.",
    hamburguer:
      "Hambúrguer pode ter pão com trigo/glúten, carne, queijo, molhos, ovo, soja e conservantes, dependendo da montagem. Se for industrializado, olhe também proteína de soja, leite em pó e traços.",
    macarrão:
      "Macarrão comum geralmente é feito de farinha de trigo ou sêmola e água, então costuma conter glúten. Algumas massas têm ovos. Versões sem glúten usam arroz, milho, mandioca ou grão-de-bico.",
    massa:
      "Massas podem levar trigo, ovos, leite ou recheios com queijo. Para glúten, procure versões certificadas sem glúten; para leite/ovo, confira a lista completa.",
    ovo:
      "Ovo é o próprio ingrediente, mas em produtos aparece como ovo, clara, gema, albumina ou ovo em pó.",
    amendoim:
      "Amendoim pode aparecer como amendoim, pasta de amendoim, farinha de amendoim ou óleo de amendoim. Também é comum aparecer em aviso de 'pode conter'.",
    castanha:
      "Castanhas podem aparecer como castanha-de-caju, castanha-do-pará, amêndoa, avelã, nozes, pistache ou macadâmia. Para alergia forte, também olhe avisos de traços.",
    granola:
      "Granola costuma ter aveia, açúcar ou mel, frutas secas, sementes e castanhas. Pode conter glúten por contaminação da aveia, além de amendoim, castanhas, leite ou soja dependendo da marca.",
    maionese:
      "Maionese geralmente tem óleo, água, ovo ou derivados, vinagre/limão e temperos. Algumas versões não têm ovo, mas precisa conferir o rótulo.",
    molho:
      "Molhos podem ter leite, soja, trigo, ovo, castanhas, corantes e conservantes. Como varia muito, a parte de alergênicos do rótulo é essencial.",
    refrigerante:
      "Refrigerante costuma ter água gaseificada, açúcar ou adoçantes, acidulantes, conservantes, corantes, aromas e cafeína em alguns sabores. Normalmente não é fonte de nutrientes importantes.",
    "coca cola":
      "Refrigerantes de cola costumam ter água gaseificada, açúcar ou adoçantes, corante caramelo, acidulante, aromas e cafeína. Para alergia, confira o rótulo específico; para saúde geral, atenção ao açúcar ou aos adoçantes.",
    suco:
      "Suco pode ser fruta, água, açúcar, conservantes e aromas, dependendo se é natural, néctar ou refresco. Para alergias, olhe corantes, traços e ingredientes adicionados.",
    "suco de caixinha":
      "Suco de caixinha muitas vezes é néctar ou refresco, com água, açúcar, suco concentrado, acidulante, aromas e conservantes. Vale comparar açúcar por porção.",
  };

  return (
    ingredientMap[food] ||
    `Eu não tenho uma ficha completa de ingredientes para ${food || "esse alimento"} sem ver o rótulo. Mas posso te orientar assim: olhe a lista de ingredientes, depois a linha de alergênicos com "contém" e "pode conter". Se você me disser sua alergia, eu aponto quais termos procurar.`
  );
}

function buildAllergyAdvice(food, mentionedAllergies, profileRisks = []) {
  const allergyLabels = mentionedAllergies.length
    ? mentionedAllergies.map((allergy) => allergy.label)
    : profileRisks.map((risk) => risk.label);
  const hasMilkRisk = allergyLabels.some((label) => normalizeText(label).includes("leite"));
  const hasGlutenRisk = allergyLabels.some((label) => normalizeText(label).includes("gluten"));
  const foodLabel = food || "esse alimento";

  if (hasMilkRisk && food === "chocolate") {
    return "Depende do chocolate. Se você tem alergia/intolerância a lactose ou leite, evite chocolate que tenha leite em pó, soro de leite, manteiga, creme de leite, caseína ou a frase 'contém leite/lactose'. Chocolate meio amargo ou 70% às vezes não tem leite, mas muitos ainda têm traços. Então a resposta segura é: só coma se o rótulo disser claramente que não contém leite/lactose e se for seguro para o seu nível de sensibilidade.";
  }

  if (hasMilkRisk) {
    return `Para ${foodLabel}, procure no rótulo termos como leite, lactose, soro de leite, leite em pó, caseína, creme de leite e manteiga. Se aparecer qualquer um deles, eu evitaria. Se disser "pode conter leite", depende da gravidade da sua alergia: para alergia forte, o mais seguro é não consumir.`;
  }

  if (hasGlutenRisk) {
    return `Para ${foodLabel}, confira se aparece trigo, cevada, centeio, malte, aveia contaminada ou "contém glúten". Se você tem doença celíaca ou reação forte, também olhe "pode conter glúten", porque contaminação cruzada pode importar.`;
  }

  if (allergyLabels.length) {
    return `Para ${foodLabel}, eu olharia primeiro a lista de ingredientes e os alertas "contém" ou "pode conter". Como você mencionou ${allergyLabels.join(", ")}, o mais seguro é evitar se o rótulo citar esse ingrediente, derivados ou risco de traços.`;
  }

  return `Para ${foodLabel}, me diga qual alergia ou restrição você tem que eu consigo te orientar melhor.`;
}

function buildAssistantAnswer(product, question, profileRisks) {
  const query = normalizeText(question);
  const mentionedAllergies = getMentionedAllergies(query);
  const mentionedFood = getMentionedFood(query);
  const askedGreeting = hasAnyTerm(query, ["oi", "ola", "olá", "e ai", "ei"]);
  const askedWellBeing =
    hasAnyTerm(query, ["tudo bem", "como vai", "beleza", "bom dia", "boa tarde", "boa noite"]);
  const askedIdentity =
    hasAnyTerm(query, ["quem é você", "quem e voce", "você funciona", "voce funciona"]) ||
    query.includes("o que voce e") ||
    query.includes("o que você é");
  const askedThanks = hasAnyTerm(query, ["obrigado", "obrigada", "valeu"]);
  const askedHelp =
    hasAnyTerm(query, ["me ajuda", "ajuda", "preciso de ajuda"]) ||
    query.includes("como faço") ||
    query.includes("como faco");
  const askedName = hasAnyTerm(query, ["nome"]) || query.includes("se chama");
  const askedIngredients =
    hasTextIntent(query, [
      "ingrediente",
      "ingredientes",
      "o que tem",
      "do que é feito",
      "do que e feito",
      "tem o que",
      "composição",
      "composicao",
      "leva o que",
      "leva leite",
      "leva lactose",
      "leva gluten",
      "leva glúten",
      "leva ovo",
      "leva soja",
      "leva amendoim",
      "leva castanha",
      "contém leite",
      "contem leite",
      "contém lactose",
      "contem lactose",
      "contém gluten",
      "contem gluten",
      "contém glúten",
      "contem glúten",
      "contém ovo",
      "contem ovo",
      "contém soja",
      "contem soja",
      "possui leite",
      "possui lactose",
      "possui gluten",
      "possui glúten",
      "possui ovo",
      "possui soja",
      "tem leite",
      "tem lactose",
      "tem gluten",
      "tem glúten",
      "tem amendoim",
      "tem ovo",
      "tem soja",
      "pode conter",
      "traços",
      "tracos",
    ]);
  const askedCapability =
    query.includes("o que voce faz") ||
    query.includes("o que você faz") ||
    query.includes("consegue fazer") ||
    query.includes("pra que serve") ||
    query.includes("para que serve");
  const askedGoodChoice =
    query.includes("boa escolha") ||
    query.includes("vale a pena") ||
    query.includes("saudavel") ||
    query.includes("saudável") ||
    query.includes("bom pra mim") ||
    query.includes("bom para mim");
  const askedCanEat =
    query.includes("posso comer") ||
    query.includes("pode comer") ||
    query.includes("posso beber") ||
    query.includes("pode beber") ||
    query.includes("da pra comer") ||
    query.includes("dá pra comer") ||
    query.includes("da para comer") ||
    query.includes("dá para comer") ||
    query.includes("devo comer") ||
    query.includes("devo evitar") ||
    query.includes("eu posso") ||
    query.includes("liberado") ||
    query.includes("é liberado") ||
    query.includes("e liberado") ||
    query.includes("posso tomar") ||
    query.includes("é seguro") ||
    query.includes("e seguro") ||
    query.includes("seguro para mim") ||
    query.includes("faz mal") ||
    query.includes("tem problema") ||
    query.includes("me faz mal") ||
    query.includes("vai me fazer mal");
  const askedAllergyAdvice =
    askedCanEat ||
    query.includes("alerg") ||
    query.includes("intoler") ||
    query.includes("lactose") ||
    query.includes("restricao") ||
    query.includes("restrição") ||
    query.includes("não posso") ||
    query.includes("nao posso") ||
    query.includes("pode conter") ||
    query.includes("contém") ||
    query.includes("contem") ||
    query.includes("traços") ||
    query.includes("tracos") ||
    query.includes("celiaco") ||
    query.includes("celíaco") ||
    query.includes("sou sensivel") ||
    query.includes("sou sensível") ||
    mentionedAllergies.length > 0;
  const askedSymptoms =
    query.includes("dor") ||
    query.includes("enjoo") ||
    query.includes("nausea") ||
    query.includes("náusea") ||
    query.includes("vomit") ||
    query.includes("diarre") ||
    query.includes("coceira") ||
    query.includes("inch") ||
    query.includes("falta de ar") ||
    query.includes("passando mal") ||
    query.includes("reacao") ||
    query.includes("reação");
  const urgentSymptoms =
    query.includes("falta de ar") ||
    query.includes("lingua") ||
    query.includes("língua") ||
    query.includes("garganta") ||
    query.includes("desma") ||
    query.includes("peito") ||
    query.includes("anafil") ||
    query.includes("rosto inch");

  if (!product) {
    if (urgentSymptoms) {
      return "Isso pode ser sinal de alerta. Se tiver falta de ar, inchaço na língua/garganta/rosto, desmaio, dor forte no peito ou piora rápida, procure emergência agora. Se for algo leve, me diga o que você comeu, quando começou e quais sintomas está sentindo.";
    }

    if (askedIngredients && mentionedFood) {
      const ingredientAdvice = buildIngredientAdvice(mentionedFood);
      if (askedAllergyAdvice || mentionedAllergies.length) {
        return `${ingredientAdvice}\n\nPensando na sua restrição: ${buildAllergyAdvice(
          mentionedFood,
          mentionedAllergies,
          profileRisks,
        )}`;
      }
      return ingredientAdvice;
    }

    if (askedAllergyAdvice && (mentionedAllergies.length || mentionedFood)) {
      return buildAllergyAdvice(mentionedFood, mentionedAllergies, profileRisks);
    }

    if (askedSymptoms) {
      return "Entendi. Me conta um pouco melhor: o que você comeu, quanto tempo depois começou, quais sintomas apareceram e se você tem alguma alergia conhecida. Se tiver falta de ar, inchaço, desmaio ou piora rápida, aí é caso de procurar atendimento imediatamente.";
    }

    if (askedGreeting) {
      return "Oi, estou por aqui. Pode mandar sua pergunta do jeito que você falaria com uma pessoa mesmo. Se quiser, também posso analisar um alimento depois que você pesquisar ou escanear.";
    }

    if (askedWellBeing) {
      return "Tudo certo por aqui. E com você? Me fala o que você quer ver: um alimento, uma alergia, uma dúvida de rótulo ou só conversar um pouco sobre alimentação.";
    }

    if (askedName) {
      return "Pode me chamar de Nutri Assistente. Eu sou um chat local do app, feito para conversar e ajudar com alimentos, rótulos, alergias e dúvidas simples de saúde.";
    }

    if (askedCapability) {
      return "Eu consigo conversar com você, explicar rótulos, falar sobre ingredientes, ajudar com alergias marcadas no perfil e analisar calorias, açúcar, sódio e proteínas quando tiver um produto selecionado.";
    }

    if (askedIdentity) {
      return "Eu sou o Nutri Assistente. Não sou um médico real, mas posso conversar de forma natural e te ajudar a entender alimentação, rótulos, ingredientes e alergias.";
    }

    if (askedThanks) {
      return "De nada. Sempre que quiser, manda outra pergunta. Se você selecionar um produto, eu consigo responder com bem mais contexto.";
    }

    if (askedHelp) {
      return "Posso sim. Me pergunte normalmente, tipo: 'esse produto é bom?', 'tem muito açúcar?', 'sou alérgico a leite, posso comer?' ou 'passei mal depois de comer, o que devo observar?'.";
    }

    return "Entendi. Posso conversar sobre isso com você. Se a dúvida for sobre alimento, alergia ou rótulo, fica ainda melhor se você pesquisar ou escanear um produto primeiro.";
  }

  const name = getProductName(product);
  const ingredients = getIngredients(product);
  const kcal = getNutrientValue(product, "energy-kcal");
  const proteins = getNutrientValue(product, "proteins");
  const sugars = getNutrientValue(product, "sugars");
  const sodium = getNutrientValue(product, "sodium");

  if (urgentSymptoms) {
    return `Se você teve reação após consumir ${name} e há falta de ar, inchaço em rosto/língua/garganta, desmaio, dor forte no peito ou piora rápida, procure emergência imediatamente. O produto pode ter ingredientes relevantes, mas nesse cenário o mais seguro é atendimento agora.`;
  }

  if (askedIngredients || query.includes("ingred")) {
    const ingredientAnswer = ingredients
      ? `Ingredientes cadastrados de ${name}: ${ingredients}`
      : `Ainda não há ingredientes cadastrados para ${name}. Confira o rótulo físico antes de consumir.`;

    if (askedAllergyAdvice || mentionedAllergies.length || profileRisks.length) {
      const allergyAnswer = profileRisks.length
        ? `Para seu perfil, eu encontrei possível relação com ${profileRisks
            .map((risk) => risk.label)
            .join(", ")}. Evite se o rótulo confirmar "contém", "pode conter" ou derivados da sua alergia.`
        : buildAllergyAdvice(mentionedFood || name, mentionedAllergies, profileRisks);
      return `${ingredientAnswer}\n\n${allergyAnswer}`;
    }

    return ingredientAnswer;
  }

  if (askedAllergyAdvice) {
    if (profileRisks.length) {
      return `${name} merece cuidado para seu perfil. Eu encontrei possível relação com ${profileRisks
        .map((risk) => risk.label)
        .join(", ")}. Antes de comer, confira o rótulo físico e evite se aparecer "contém", "pode conter" ou derivados do ingrediente da sua alergia.`;
    }

    if (mentionedAllergies.length || mentionedFood) {
      return `${buildAllergyAdvice(mentionedFood || name, mentionedAllergies, profileRisks)}\n\nSobre ${name}: com os dados atuais, não apareceu conflito direto com as alergias marcadas, mas eu ainda conferiria o rótulo físico antes de consumir.`;
    }
  }

  if (askedIngredients && mentionedFood && normalizeText(mentionedFood) !== normalizeText(name)) {
    return buildIngredientAdvice(mentionedFood);
  }

  if (askedSymptoms) {
    return `Vamos olhar isso com cuidado. Você está falando de ${name}. Me diga quais sintomas apareceram, quanto tempo depois de consumir, sua idade, alergias conhecidas e se houve falta de ar, inchaço, vômitos repetidos ou piora rápida. Enquanto isso, confira o rótulo físico e evite consumir novamente se suspeitar de reação.`;
  }

  if (askedGreeting) {
    return `Oi. Estou com ${name} aberto aqui. Pode perguntar sobre ingredientes, calorias, açúcar, sódio, proteínas ou se combina com suas alergias.`;
  }

  if (askedWellBeing) {
    return `Tudo certo. E você? Já que estamos com ${name} aberto, posso te ajudar a entender se ele é uma boa escolha, se tem muito açúcar/sódio ou se aparece algum risco para suas alergias.`;
  }

  if (askedGoodChoice) {
    const notes = [];
    if (profileRisks.length) notes.push("tem possível conflito com suas alergias");
    if (sugars !== null && sugars > 15) notes.push("tem açúcar relativamente alto por 100 g");
    if (sodium !== null && sodium > 400) notes.push("tem sódio alto por 100 g");
    if (proteins !== null && proteins >= 10) notes.push("tem boa presença de proteínas");

    return notes.length
      ? `${name} merece atenção porque ${notes.join(", ")}. Eu olharia a porção e conferiria o rótulo físico antes de decidir.`
      : `${name} não acendeu nenhum alerta forte com os dados cadastrados. Ainda assim, vale comparar porção, ingredientes e seu objetivo do momento.`;
  }

  if (askedIdentity) {
    return `Eu sou o Nutri Assistente. Agora estou usando ${name} como contexto para responder suas perguntas de um jeito mais direto.`;
  }

  if (query.includes("alerg") || query.includes("posso comer")) {
    if (profileRisks.length) {
      return `${name} merece cuidado para seu perfil. Encontrei ${profileRisks
        .map((risk) => risk.label)
        .join(", ")} nos ingredientes ou tags. Minha orientação é não consumir sem confirmar o rótulo físico; se você já consumiu e tiver falta de ar, inchaço, urticária intensa, vômitos repetidos ou tontura, procure atendimento.`;
    }
    return `${name} não bateu com as alergias marcadas no perfil, mas isso não garante segurança absoluta. Confira o rótulo físico, observe traços/contaminação cruzada e evite se você já teve reação a produto parecido.`;
  }

  if (query.includes("prote")) {
    return proteins !== null
      ? `${name} tem cerca de ${formatNumber(proteins)} g de proteínas por 100 g.`
      : `Não encontrei proteína cadastrada para ${name}.`;
  }

  if (query.includes("calor") || query.includes("energia")) {
    return kcal !== null
      ? `${name} tem cerca de ${formatNumber(kcal)} kcal por 100 g.`
      : `Não encontrei calorias cadastradas para ${name}.`;
  }

  if (query.includes("sodio") || query.includes("sódio") || query.includes("sal")) {
    return sodium !== null
      ? `${name} tem cerca de ${formatNumber(sodium)} mg de sódio por 100 g. Compare esse valor com outros produtos parecidos e observe a porção que você realmente vai consumir.`
      : `Não encontrei sódio cadastrado para ${name}. Confira o rótulo físico para comparar melhor.`;
  }

  if (query.includes("acucar") || query.includes("açucar") || query.includes("açúcar")) {
    return sugars !== null
      ? `${name} tem cerca de ${formatNumber(sugars)} g de açúcares por 100 g.`
      : `Não encontrei açúcar cadastrado para ${name}.`;
  }

  if (askedHelp) {
    return `Com ${name}, eu posso te ajudar a entender ingredientes, calorias, açúcar, sódio, proteínas e alertas de alergia. Pergunte, por exemplo: "tem muito açúcar?", "quais alergênicos aparecem?" ou "esse produto é uma boa escolha?".`;
  }

  return `${name}: ${product.localInsight || "analise a tabela nutricional, os ingredientes e os alertas antes de decidir."}`;
}

function App() {
  const videoRef = useRef(null);
  const chatLogRef = useRef(null);
  const scanControlsRef = useRef(null);
  const lastDetectedRef = useRef("");
  const lastAssistantQuestionRef = useRef("");
  const [activePage, setActivePage] = useState("home");
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState(null);
  const [localMatches, setLocalMatches] = useState([]);
  const [scannerState, setScannerState] = useState("idle");
  const [users, setUsers] = useState(() => readStoredUsers());
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUsers = readStoredUsers();
    const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
    const sessionUser = storedUsers.find((user) => user.email === sessionEmail);
    return getPublicUser(sessionUser);
  });
  const [selectedAllergies, setSelectedAllergies] = useState(() => {
    const storedUsers = readStoredUsers();
    const sessionEmail = localStorage.getItem(SESSION_STORAGE_KEY);
    const sessionUser = storedUsers.find((user) => user.email === sessionEmail);
    return sessionUser?.allergies?.length ? sessionUser.allergies : readStoredAllergies();
  });
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [authStatus, setAuthStatus] = useState({
    type: "ready",
    message: "Entre ou crie uma conta para salvar suas alergias.",
  });
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantConnection, setAssistantConnection] = useState({
    type: "ready",
    message: "Pronto para conversar.",
  });
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: "assistant",
      text: "Oi, eu sou o Nutri Assistente. Pode conversar comigo normalmente. Eu consigo falar sobre alimentos, rótulos, alergias, sintomas leves e também te ajudar a entender o produto que você escanear.",
    },
  ]);
  const [status, setStatus] = useState({
    type: "ready",
    message: "Busque por alimento, digite um código ou ligue a câmera.",
  });

  useEffect(() => {
    const validPages = ["home", "consulta", "scan", "alergias", "chat", "guia", "conta"];
    const syncPageWithHash = () => {
      const pageFromHash = window.location.hash.replace("#", "");
      if (validPages.includes(pageFromHash)) {
        setActivePage(pageFromHash);
      }
    };

    syncPageWithHash();
    window.addEventListener("hashchange", syncPageWithHash);
    return () => window.removeEventListener("hashchange", syncPageWithHash);
  }, []);

  const nutrientRows = useMemo(() => getNutrientRows(product?.nutriments), [product]);
  const allergyScan = useMemo(
    () => scanAllergies(product, selectedAllergies),
    [product, selectedAllergies],
  );
  const productScore = useMemo(
    () => getNutritionScore(product, allergyScan.profileRisks),
    [product, allergyScan.profileRisks],
  );

  const stopScanner = useCallback(() => {
    scanControlsRef.current?.stop();
    scanControlsRef.current = null;
    lastDetectedRef.current = "";
    setScannerState("idle");
  }, []);

  const selectProduct = useCallback((nextProduct) => {
    setProduct(nextProduct);
    setQuery(nextProduct.isLocal ? getProductName(nextProduct) : nextProduct.code || "");
    setStatus({
      type: "success",
      message: `${getProductName(nextProduct)} carregado.`,
    });
  }, []);

  const searchProduct = useCallback(
    async (rawQuery) => {
      const nextQuery = rawQuery.trim();
      if (!nextQuery) {
        setStatus({ type: "warning", message: "Digite um alimento ou código de barras." });
        return;
      }

      setQuery(nextQuery);
      setProduct(null);
      setLocalMatches([]);

      if (!isBarcodeQuery(nextQuery)) {
        const matches = findLocalFoods(nextQuery);
        if (matches.length) {
          setLocalMatches(matches);
          selectProduct(matches[0]);
          setStatus({
            type: "success",
            message: `${matches.length} resultado(s) na base local brasileira.`,
          });
          return;
        }

        setStatus({
          type: "warning",
          message: "Não encontrei na base local. Tente o código de barras.",
        });
        return;
      }

      const barcode = cleanBarcode(nextQuery);
      setStatus({ type: "loading", message: `Buscando produto ${barcode}...` });

      try {
        const foundProduct = await fetchProductByBarcode(barcode);
        if (!foundProduct) {
          setStatus({
            type: "warning",
            message: "Produto não encontrado na base aberta.",
          });
          return;
        }
        selectProduct(foundProduct);
      } catch (error) {
        setStatus({
          type: "error",
          message: error.message || "Não foi possível consultar o produto.",
        });
      }
    },
    [selectProduct],
  );

  const startScanner = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ type: "error", message: "Este navegador não liberou acesso à câmera." });
      return;
    }

    lastDetectedRef.current = "";
    setScannerState("starting");
    setStatus({ type: "loading", message: "Abrindo câmera..." });

    try {
      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result) {
            const detectedBarcode = cleanBarcode(result.getText());
            if (detectedBarcode && detectedBarcode !== lastDetectedRef.current) {
              lastDetectedRef.current = detectedBarcode;
              searchProduct(detectedBarcode);
            }
            return;
          }

          if (error && !(error instanceof NotFoundException)) {
            setStatus({ type: "warning", message: "Reposicione o código na moldura." });
          }
        },
      );

      scanControlsRef.current = controls;
      setScannerState("scanning");
      setStatus({ type: "ready", message: "Câmera ativa." });
    } catch (error) {
      setScannerState("idle");
      setStatus({
        type: "error",
        message:
          error?.name === "NotAllowedError"
            ? "Permissão da câmera negada."
            : "Não foi possível iniciar o scanner.",
      });
    }
  }, [searchProduct]);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  useEffect(() => {
    chatLogRef.current?.scrollTo({
      top: chatLogRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [assistantMessages, assistantLoading]);

  const submitSearch = (event) => {
    event.preventDefault();
    const formQuery = new FormData(event.currentTarget).get("query");
    searchProduct(String(formQuery || query));
  };

  const saveAllergiesForSession = (nextAllergies) => {
    if (!currentUser) {
      localStorage.setItem(GUEST_ALLERGIES_KEY, JSON.stringify(nextAllergies));
      return;
    }

    const nextUsers = users.map((user) =>
      user.email === currentUser.email ? { ...user, allergies: nextAllergies } : user,
    );

    setUsers(nextUsers);
    writeStoredUsers(nextUsers);
    setCurrentUser((user) => (user ? { ...user, allergies: nextAllergies } : user));
  };

  const toggleAllergy = (id) => {
    setSelectedAllergies((current) => {
      const nextAllergies = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];

      saveAllergiesForSession(nextAllergies);
      return nextAllergies;
    });
  };

  const updateAuthForm = (field, value) => {
    setAuthForm((current) => ({ ...current, [field]: value }));
  };

  const submitAuth = async (event) => {
    event.preventDefault();

    const name = authForm.name.trim();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();

    if (!email || !password || (authMode === "register" && !name)) {
      setAuthStatus({
        type: "warning",
        message: "Preencha os campos necessários para continuar.",
      });
      return;
    }

    if (password.length < 6) {
      setAuthStatus({
        type: "warning",
        message: "Use uma senha com pelo menos 6 caracteres.",
      });
      return;
    }

    const passwordHash = await hashPassword(password);

    if (authMode === "register") {
      const alreadyExists = users.some(
        (user) => user.email === email || normalizeText(user.name) === normalizeText(name),
      );

      if (alreadyExists) {
        setAuthStatus({
          type: "warning",
          message: "Já existe uma conta com esse e-mail ou usuário.",
        });
        return;
      }

      const newUser = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash,
        allergies: selectedAllergies,
        createdAt: new Date().toISOString(),
      };
      const nextUsers = [...users, newUser];

      setUsers(nextUsers);
      writeStoredUsers(nextUsers);
      localStorage.setItem(SESSION_STORAGE_KEY, newUser.email);
      setCurrentUser(getPublicUser(newUser));
      setAuthForm({ name: "", email: "", password: "" });
      setAuthStatus({
        type: "success",
        message: "Conta criada. Suas alergias foram salvas nesse perfil.",
      });
      return;
    }

    const foundUser = findUserByIdentifier(users, email);

    if (!foundUser || foundUser.passwordHash !== passwordHash) {
      setAuthStatus({
        type: "error",
        message: "Usuário, e-mail ou senha inválidos.",
      });
      return;
    }

    localStorage.setItem(SESSION_STORAGE_KEY, foundUser.email);
    setCurrentUser(getPublicUser(foundUser));
    setSelectedAllergies(foundUser.allergies?.length ? foundUser.allergies : DEFAULT_ALLERGIES);
    setAuthForm({ name: "", email: "", password: "" });
    setAuthStatus({
      type: "success",
      message: `Bem-vindo de volta, ${foundUser.name}.`,
    });
  };

  const logout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setCurrentUser(null);
    setSelectedAllergies(readStoredAllergies());
    setAuthStatus({
      type: "ready",
      message: "Você saiu da conta. Entre novamente para recuperar suas alergias.",
    });
  };

  const submitAssistant = async (event) => {
    event.preventDefault();
    const question = assistantQuestion.trim();
    if (!question) return;

    lastAssistantQuestionRef.current = question;
    const nextMessages = [...assistantMessages, { role: "user", text: question }];
    setAssistantMessages(nextMessages);
    setAssistantQuestion("");
    setAssistantLoading(true);
    setAssistantConnection({
      type: "loading",
      message: "Estou pensando na sua pergunta...",
    });

    const thinkingDelay = Math.min(900, 320 + question.length * 8);
    await new Promise((resolve) => {
      window.setTimeout(resolve, thinkingDelay);
    });

    const answer = buildAssistantAnswer(product, question, allergyScan.profileRisks);
    setAssistantMessages([...nextMessages, { role: "assistant", text: answer }]);
    setAssistantConnection({
      type: "success",
      message: "Pronto, respondi sua pergunta.",
    });
    setAssistantLoading(false);
  };

  const retryAssistant = () => {
    const lastQuestion = lastAssistantQuestionRef.current;
    if (!lastQuestion || assistantLoading) return;
    setAssistantQuestion(lastQuestion);
    window.setTimeout(() => {
      document.querySelector("#assistant-question")?.focus();
    }, 0);
  };

  const StatusIcon =
    {
      ready: Sparkles,
      loading: Loader2,
      success: CheckCircle2,
      warning: ShieldAlert,
      error: AlertCircle,
    }[status.type] || Sparkles;

  const navigateTo = (page) => {
    setActivePage(page);
    window.history.replaceState(null, "", `#${page}`);
  };

  const searchAndOpen = (value) => {
    navigateTo("consulta");
    searchProduct(value);
  };

  const renderProductAnalysis = () =>
    product ? (
      <div className="content-grid">
        <section className="product-section">
          <div className="product-header">
            <div className="product-image-wrap">
              {product.image_front_url ? (
                <img
                  src={product.image_front_url}
                  alt={getProductName(product)}
                  className="product-image"
                />
              ) : (
                <Utensils size={58} strokeWidth={1.5} aria-hidden="true" />
              )}
            </div>
            <div className="product-title">
              <p>{product.brands || product.source || "Origem não informada"}</p>
              <h3>{getProductName(product)}</h3>
              <div className="product-meta">
                <span>{product.source}</span>
                {product.quantity && <span>{product.quantity}</span>}
                <span className={`nutri-score grade-${getNutriScoreClass(product)}`}>
                  Nutri-Score {getNutriScore(product)}
                </span>
              </div>
            </div>
          </div>

          {localMatches.length > 1 && (
            <div className="match-strip">
              {localMatches.map((match) => (
                <button
                  type="button"
                  key={match.code}
                  className={match.code === product.code ? "active" : ""}
                  onClick={() => selectProduct(match)}
                >
                  {getProductName(match)}
                </button>
              ))}
            </div>
          )}

          <div className="analysis-banner">
            <CircleGauge size={22} aria-hidden="true" />
            <div>
              <strong>{productScore.label}</strong>
              <span>
                {productScore.notes.length
                  ? productScore.notes.join(" ")
                  : product.localInsight || "Sem alertas relevantes cadastrados."}
              </span>
            </div>
          </div>

          <article className="info-block nutrition-block">
            <div className="block-heading">
              <h4>Tabela nutricional</h4>
              <span>
                {product.nutrition_data_per ? `Por ${product.nutrition_data_per}` : "Por 100 g"}
              </span>
            </div>
            {nutrientRows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Nutriente</th>
                    <th>Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {nutrientRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>
                        {row.amount} {row.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-copy">Tabela nutricional não cadastrada para este produto.</p>
            )}
          </article>
        </section>

        <aside className="insight-column">
          <article className="info-block">
            <div className="block-heading">
              <h4>Ingredientes</h4>
            </div>
            <p className="ingredients-copy">
              {getIngredients(product) || "Ingredientes não cadastrados para este produto."}
            </p>
          </article>

          <article className={`info-block risk-block ${productScore.tone}`}>
            <div className="block-heading">
              <h4>Alertas do perfil</h4>
            </div>
            <div className="tag-list">
              {allergyScan.profileRisks.length ? (
                allergyScan.profileRisks.map((risk) => (
                  <span className="danger-tag" key={risk.id}>
                    {risk.label}
                  </span>
                ))
              ) : (
                <span className="quiet-tag">Sem conflito com o perfil</span>
              )}
            </div>
          </article>

          <article className="info-block">
            <div className="block-heading">
              <h4>Pontos de atenção</h4>
            </div>
            <div className="tag-list">
              {allergyScan.allRisks.length ? (
                allergyScan.allRisks.map((risk) => (
                  <span className="soft-tag" key={risk.id}>
                    {risk.label}
                  </span>
                ))
              ) : (
                <span className="quiet-tag">Nenhum alergênico detectado</span>
              )}
              {[...(product.labels_tags || []), ...(product.categories_tags || [])]
                .filter(Boolean)
                .slice(0, 6)
                .map((tag) => (
                  <span className="quiet-tag" key={tag}>
                    {formatTag(tag)}
                  </span>
                ))}
            </div>
          </article>
        </aside>
      </div>
    ) : (
      <section className="empty-state">
        <Barcode size={80} strokeWidth={1.25} aria-hidden="true" />
        <h3>Nenhum alimento selecionado</h3>
        <p>Busque por nome, experimente um exemplo ou escaneie um código de barras.</p>
      </section>
    );

  const renderHomePage = () => (
    <>
      <header className="workspace-header">
        <div className="hero-copy">
          <p className="eyebrow dark">Tela principal</p>
          <h2>Consulte alimentos, rótulos e alergênicos em uma tela só.</h2>
          <p>
            Aponte a câmera, leia o código de barras e transforme um rótulo confuso em uma decisão simples sobre ingredientes, nutrientes e restrições.
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => navigateTo("scan")}>
              <Camera size={20} aria-hidden="true" />
              Começar pelo scan
            </button>
            <button className="secondary-button" type="button" onClick={() => navigateTo("consulta")}>
              <Search size={20} aria-hidden="true" />
              Pesquisar alimento
            </button>
          </div>
        </div>
        <div className="metric-row">
          <div>
            <strong>{LOCAL_FOODS.length}</strong>
            <span>alimentos locais</span>
          </div>
          <div>
            <strong>OFF</strong>
            <span>base global</span>
          </div>
          <div>
            <strong>{selectedAllergies.length}</strong>
            <span>alertas ativos</span>
          </div>
        </div>
      </header>

      <section className="page-grid">
        <article className="page-card accent-search">
          <Search size={24} aria-hidden="true" />
          <h3>Consulta nutricional</h3>
          <p>Pesquise alimentos comuns ou produtos por código de barras.</p>
          <button type="button" onClick={() => navigateTo("consulta")}>
            Abrir consulta
          </button>
        </article>
        <article className="page-card accent-scan">
          <Camera size={24} aria-hidden="true" />
          <h3>Scan de produto</h3>
          <p>Use a câmera ou digite o código de barras manualmente.</p>
          <button type="button" onClick={() => navigateTo("scan")}>
            Abrir scan
          </button>
        </article>
        <article className="page-card accent-chat">
          <Bot size={24} aria-hidden="true" />
          <h3>Chat com IA</h3>
          <p>Converse com o assistente usando o produto analisado.</p>
          <button type="button" onClick={() => navigateTo("chat")}>
            Abrir chat
          </button>
        </article>
      </section>

      {renderProductAnalysis()}
    </>
  );

  const renderConsultaPage = () => (
    <>
      <header className="page-header">
        <p className="eyebrow dark">Consulta</p>
        <h2>Pesquise por alimento ou código de barras.</h2>
      </header>
      <form className="search-card page-search" onSubmit={submitSearch}>
        <label htmlFor="food-search-page">Alimento ou código</label>
        <div className="input-row">
          <input
            id="food-search-page"
            name="query"
            placeholder="Ex: arroz ou 3017624010701"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="submit" aria-label="Buscar alimento">
            <Search size={20} aria-hidden="true" />
            Buscar
          </button>
        </div>
      </form>
      <div className="chip-list page-chips">
        {SAMPLE_QUERIES.map((sample) => (
          <button type="button" key={sample} onClick={() => searchProduct(sample)}>
            {sample}
          </button>
        ))}
        {SAMPLE_BARCODES.map((sample) => (
          <button type="button" key={sample.code} onClick={() => searchProduct(sample.code)}>
            {sample.label}
          </button>
        ))}
      </div>
      <div className={`status-line ${status.type}`}>
        <StatusIcon
          size={18}
          className={status.type === "loading" ? "spin" : ""}
          aria-hidden="true"
        />
        <span>{status.message}</span>
      </div>
      {renderProductAnalysis()}
    </>
  );

  const renderScanPage = () => (
    <>
      <header className="page-header">
        <p className="eyebrow dark">Scan</p>
        <h2>Escaneie o código de barras do produto.</h2>
      </header>
      <section className="scan-page-grid">
        <div className="scanner-stage">
          <video
            ref={videoRef}
            className="camera-preview"
            muted
            playsInline
            aria-label="Visualização da câmera"
          />
          {scannerState === "idle" && (
            <div className="camera-placeholder">
              <Barcode size={70} strokeWidth={1.4} aria-hidden="true" />
            </div>
          )}
          <div className="scan-frame" aria-hidden="true" />
        </div>
        <div className="scan-controls">
          {scannerState === "idle" ? (
            <button className="primary-button" onClick={startScanner}>
              <Camera size={20} aria-hidden="true" />
              Ligar câmera
            </button>
          ) : (
            <button className="secondary-button" onClick={stopScanner}>
              <CameraOff size={20} aria-hidden="true" />
              Desligar câmera
            </button>
          )}
          <form className="search-card" onSubmit={submitSearch}>
            <label htmlFor="barcode-page">Digitar código manualmente</label>
            <div className="input-row">
              <input
                id="barcode-page"
                name="query"
                inputMode="numeric"
                placeholder="Ex: 3017624010701"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" aria-label="Buscar código">
                <Search size={20} aria-hidden="true" />
              </button>
            </div>
          </form>
          <div className={`status-line ${status.type}`}>
            <StatusIcon
              size={18}
              className={status.type === "loading" ? "spin" : ""}
              aria-hidden="true"
            />
            <span>{status.message}</span>
          </div>
        </div>
      </section>
      {renderProductAnalysis()}
    </>
  );

  const renderAlergiasPage = () => (
    <>
      <header className="page-header">
        <p className="eyebrow dark">Alergias</p>
        <h2>Configure o perfil de restrições do usuário.</h2>
        <p className="page-subtitle">
          {currentUser
            ? `Essas alergias estão salvas na conta de ${currentUser.name}.`
            : "Entre em uma conta para salvar suas alergias e recuperar depois."}
        </p>
      </header>
      <section className="allergy-page-grid">
        {ALLERGY_OPTIONS.map((option) => (
          <label key={option.id} className="check-row">
            <input
              type="checkbox"
              checked={selectedAllergies.includes(option.id)}
              onChange={() => toggleAllergy(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </section>
      {renderProductAnalysis()}
    </>
  );

  const renderChatPage = () => (
    <>
      <header className="page-header">
        <p className="eyebrow dark">Chat com IA</p>
        <h2>Converse com o assistente normalmente.</h2>
        <p className="page-subtitle">
          Ele responde dúvidas gerais, ajuda com alimentos e usa o produto atual quando houver um selecionado.
        </p>
      </header>
      <article className="assistant-card assistant-page">
        <div className="panel-heading">
          <Bot size={18} aria-hidden="true" />
          <h4>Nutri Assistente</h4>
        </div>
        <div className={`assistant-status ${assistantConnection.type}`}>
          <StatusIcon
            size={17}
            className={assistantConnection.type === "loading" ? "spin" : ""}
            aria-hidden="true"
          />
          <span>{assistantConnection.message}</span>
        </div>
        <div className="prompt-suggestions">
          {[
            "Oi, tudo bem?",
            "O que você consegue fazer?",
            "Esse produto é uma boa escolha?",
          ].map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => setAssistantQuestion(suggestion)}
              disabled={assistantLoading}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="chat-log" ref={chatLogRef}>
          {assistantMessages.map((message, index) => (
            <p className={`chat-message ${message.role}`} key={`${message.role}-${index}`}>
              {message.text}
            </p>
          ))}
          {assistantLoading && (
            <p className="chat-message assistant pending">
              <Loader2 size={16} className="spin" aria-hidden="true" />
              Pensando...
            </p>
          )}
        </div>
        <form className="assistant-form" onSubmit={submitAssistant}>
          <input
            id="assistant-question"
            placeholder="Pergunte sobre calorias, açúcar, alergias..."
            value={assistantQuestion}
            onChange={(event) => setAssistantQuestion(event.target.value)}
            disabled={assistantLoading}
          />
          <button type="submit" aria-label="Perguntar ao assistente" disabled={assistantLoading}>
            <MessageSquareText size={18} aria-hidden="true" />
            {assistantLoading ? "Enviando" : "Enviar"}
          </button>
        </form>
        {lastAssistantQuestionRef.current && !assistantLoading && (
          <button className="retry-button" type="button" onClick={retryAssistant}>
            Tentar novamente a última pergunta
          </button>
        )}
      </article>
    </>
  );

  const renderAccountPage = () => (
    <>
      <header className="page-header">
        <p className="eyebrow dark">Conta</p>
        <h2>Salve seu perfil e recupere suas alergias depois.</h2>
        <p className="page-subtitle">
          Cada conta mantém uma lista própria de alergias para cruzar com os alimentos consultados.
        </p>
      </header>

      {currentUser ? (
        <section className="account-grid">
          <article className="account-card profile-card">
            <div className="account-avatar">
              <User size={30} aria-hidden="true" />
            </div>
            <p className="eyebrow dark">Perfil conectado</p>
            <h3>{currentUser.name}</h3>
            <span>{currentUser.email}</span>
            <div className="saved-allergies">
              {selectedAllergies.length ? (
                selectedAllergies.map((id) => {
                  const allergy = ALLERGY_OPTIONS.find((option) => option.id === id);
                  return (
                    <span className="soft-tag" key={id}>
                      {allergy?.label || id}
                    </span>
                  );
                })
              ) : (
                <span className="quiet-tag">Nenhuma alergia marcada</span>
              )}
            </div>
            <button className="secondary-button" type="button" onClick={logout}>
              <LogOut size={18} aria-hidden="true" />
              Sair da conta
            </button>
          </article>

          <article className="account-card">
            <div className="panel-heading">
              <ShieldAlert size={18} aria-hidden="true" />
              <h4>Alergias desse perfil</h4>
            </div>
            <div className="allergy-grid">
              {ALLERGY_OPTIONS.map((option) => (
                <label key={option.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedAllergies.includes(option.id)}
                    onChange={() => toggleAllergy(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </article>
        </section>
      ) : (
        <section className="auth-layout">
          <article className="auth-card">
            <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                <LogIn size={18} aria-hidden="true" />
                Entrar
              </button>
              <button
                type="button"
                className={authMode === "register" ? "active" : ""}
                onClick={() => setAuthMode("register")}
              >
                <UserPlus size={18} aria-hidden="true" />
                Criar conta
              </button>
            </div>

            <form className="auth-form" onSubmit={submitAuth}>
              {authMode === "register" && (
                <label>
                  <span>Usuário</span>
                  <div className="field-with-icon">
                    <User size={18} aria-hidden="true" />
                    <input
                      value={authForm.name}
                      onChange={(event) => updateAuthForm("name", event.target.value)}
                      placeholder="Ex: Diego"
                    />
                  </div>
                </label>
              )}
              <label>
                <span>{authMode === "login" ? "E-mail ou usuário" : "E-mail"}</span>
                <div className="field-with-icon">
                  <Mail size={18} aria-hidden="true" />
                  <input
                    type={authMode === "login" ? "text" : "email"}
                    value={authForm.email}
                    onChange={(event) => updateAuthForm("email", event.target.value)}
                    placeholder={authMode === "login" ? "seu e-mail ou usuário" : "voce@email.com"}
                  />
                </div>
              </label>
              <label>
                <span>Senha</span>
                <div className="field-with-icon">
                  <Lock size={18} aria-hidden="true" />
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => updateAuthForm("password", event.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                  />
                </div>
              </label>
              <button className="primary-button" type="submit">
                {authMode === "register" ? (
                  <UserPlus size={18} aria-hidden="true" />
                ) : (
                  <LogIn size={18} aria-hidden="true" />
                )}
                {authMode === "register" ? "Criar minha conta" : "Entrar na conta"}
              </button>
            </form>

            <div className={`status-line ${authStatus.type}`}>
              <StatusIcon size={18} aria-hidden="true" />
              <span>{authStatus.message}</span>
            </div>
          </article>

          <aside className="account-card account-benefits">
            <h3>Por que criar uma conta?</h3>
            <p>O app lembra suas alergias e aplica os alertas quando você consulta ou escaneia alimentos.</p>
            <div className="guide-item">
              <ShieldAlert size={20} aria-hidden="true" />
              <span>Alergias recuperadas ao entrar novamente.</span>
            </div>
            <div className="guide-item">
              <Bot size={20} aria-hidden="true" />
              <span>Chat com IA usando o perfil e o produto atual.</span>
            </div>
          </aside>
        </section>
      )}
    </>
  );

  const renderGuiaPage = () => (
    <>
      <header className="page-header">
        <p className="eyebrow dark">Guia</p>
        <h2>Pontos de atenção por alergia e rótulo.</h2>
      </header>
      <section className="guide-band guide-page">
        <div className="guide-item">
          <ClipboardList size={20} aria-hidden="true" />
          <span>Leia ingredientes antes da tabela quando houver alergia.</span>
        </div>
        <div className="guide-item">
          <CircleGauge size={20} aria-hidden="true" />
          <span>Compare açúcar, sódio e proteínas por 100 g.</span>
        </div>
        <div className="guide-item">
          <ShieldAlert size={20} aria-hidden="true" />
          <span>Produto sem dado cadastrado deve ser conferido no rótulo físico.</span>
        </div>
      </section>
      <section className="page-grid">
        {ALLERGY_OPTIONS.map((option) => (
          <article className="page-card" key={option.id}>
            <ShieldAlert size={22} aria-hidden="true" />
            <h3>{option.label}</h3>
            <p>Observe termos como {option.terms.slice(0, 4).join(", ")} nos ingredientes.</p>
          </article>
        ))}
      </section>
    </>
  );

  const renderActivePage = () => {
    if (activePage === "consulta") return renderConsultaPage();
    if (activePage === "scan") return renderScanPage();
    if (activePage === "alergias") return renderAlergiasPage();
    if (activePage === "chat") return renderChatPage();
    if (activePage === "conta") return renderAccountPage();
    if (activePage === "guia") return renderGuiaPage();
    return renderHomePage();
  };

  const navItems = [
    { id: "home", label: "Tela principal", icon: Home },
    { id: "consulta", label: "Consulta", icon: Search },
    { id: "scan", label: "Scan", icon: Camera },
    { id: "alergias", label: "Alergias", icon: ShieldAlert },
    { id: "chat", label: "Chat com IA", icon: Bot },
    { id: "conta", label: currentUser ? "Perfil" : "Login", icon: currentUser ? User : LogIn },
    { id: "guia", label: "Guia", icon: ClipboardList },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Dashboard">
        <div className="brand-block">
          <div className="brand-mark">
            <Leaf size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Projeto do Ano</p>
            <h1>NutriScan</h1>
          </div>
        </div>

        <nav className="dashboard-menu" aria-label="Navegação do dashboard">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={activePage === item.id ? "active" : ""}
                onClick={() => navigateTo(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="dashboard-summary" aria-label="Resumo do aplicativo">
          <p className="eyebrow">O que a gente faz</p>
          <strong>Leitura nutricional rápida para decidir melhor.</strong>
          <span>
            Pesquise alimentos, escaneie rótulos, veja ingredientes, cruze com alergias e converse com o assistente.
          </span>
        </section>

        <section className="account-mini" aria-label="Conta atual">
          <User size={18} aria-hidden="true" />
          <div>
            <strong>{currentUser ? currentUser.name : "Visitante"}</strong>
            <span>
              {currentUser
                ? `${selectedAllergies.length} alergia(s) salva(s)`
                : "Entre para salvar suas alergias"}
            </span>
          </div>
          <button type="button" onClick={() => navigateTo("conta")}>
            {currentUser ? "Perfil" : "Entrar"}
          </button>
        </section>

        <div className={`status-line ${status.type}`}>
          <StatusIcon
            size={18}
            className={status.type === "loading" ? "spin" : ""}
            aria-hidden="true"
          />
          <span>{status.message}</span>
        </div>

        <section className="quick-panel" aria-label="Exemplos rápidos">
          <div className="panel-heading">
            <Utensils size={18} aria-hidden="true" />
            <h2>Exemplos rápidos</h2>
          </div>
          <div className="chip-list">
            {SAMPLE_QUERIES.map((sample) => (
              <button type="button" key={sample} onClick={() => searchAndOpen(sample)}>
                {sample}
              </button>
            ))}
            {SAMPLE_BARCODES.map((sample) => (
              <button type="button" key={sample.code} onClick={() => searchAndOpen(sample.code)}>
                {sample.label}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="workspace" aria-label="Página atual">
        {renderActivePage()}
      </section>
    </main>
  );
}

export default App;


