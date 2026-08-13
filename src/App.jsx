import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// O ZXing é carregado sob demanda (ver loadScannerLib). São ~430 kB que só
// fazem sentido baixar quando o usuário realmente vai ligar a câmera.
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
const SEARCH_BASE = "https://world.openfoodfacts.org/api/v2/search";
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
  "traces_tags",
  "traces",
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

// Cobertura dos alergênicos de declaração obrigatória (Anvisa RDC 26/2015).
// `tags` lista os identificadores da Open Food Facts (que vêm prefixados por idioma,
// ex.: "en:milk") e é comparada por igualdade, não por substring.
const ALLERGY_OPTIONS = [
  {
    id: "milk",
    label: "Leite/lactose",
    terms: [
      "leite",
      "lactose",
      "whey",
      "caseina",
      "milk",
      "soro de leite",
      "leite em po",
      "proteina do leite",
      "derivados de leite",
      "lacteo",
      "creme de leite",
      "manteiga de leite",
      "manteiga lactea",
      "gordura anidra de leite",
    ],
    tags: ["en:milk", "en:lactose", "pt:leite", "es:leche", "fr:lait", "it:latte", "de:milch"],
  },
  {
    id: "gluten",
    label: "Glúten",
    terms: [
      "gluten",
      "trigo",
      "farinha de trigo",
      "cevada",
      "centeio",
      "aveia",
      "malte",
      "celiaco",
    ],
    tags: [
      "en:gluten",
      "en:wheat",
      "en:barley",
      "en:rye",
      "en:oats",
      "en:spelt",
      "pt:gluten",
      "pt:trigo",
      "pt:aveia",
      "es:trigo",
      "es:avena",
      "fr:gluten",
      "fr:ble",
    ],
  },
  {
    id: "peanut",
    label: "Amendoim",
    terms: ["amendoim", "peanut"],
    tags: ["en:peanuts", "pt:amendoim", "es:cacahuetes", "fr:arachides"],
  },
  {
    id: "nuts",
    label: "Castanhas",
    terms: [
      "castanha",
      "castanha de caju",
      "castanha do para",
      "amendoa",
      "avela",
      "nozes",
      "noz",
      "pistache",
      "macadamia",
      "noz pecan",
    ],
    tags: [
      "en:nuts",
      "en:almonds",
      "en:hazelnuts",
      "en:walnuts",
      "en:cashew-nuts",
      "en:brazil-nuts",
      "en:pistachio-nuts",
      "en:macadamia-nuts",
      "pt:castanha",
      "pt:avela",
      "es:frutos-de-cascara",
      "fr:fruits-a-coque",
    ],
  },
  {
    id: "soy",
    label: "Soja",
    terms: ["soja", "soy", "lecitina de soja", "proteina de soja"],
    tags: ["en:soybeans", "pt:soja", "es:soja", "fr:soja"],
  },
  {
    id: "egg",
    label: "Ovo",
    terms: ["ovo", "ovos", "clara de ovo", "gema de ovo", "albumina", "ovo em po", "egg"],
    tags: ["en:eggs", "pt:ovo", "pt:ovos", "es:huevos", "fr:oeufs"],
  },
  {
    id: "fish",
    label: "Peixe",
    terms: ["peixe", "bacalhau", "atum", "sardinha", "salmao", "anchova", "fish"],
    tags: ["en:fish", "pt:peixe", "es:pescado", "fr:poissons"],
  },
  {
    id: "crustacean",
    label: "Crustáceos",
    terms: ["camarao", "caranguejo", "lagosta", "siri", "crustaceo", "crustaceos"],
    tags: ["en:crustaceans", "pt:crustaceos", "es:crustaceos", "fr:crustaces"],
  },
  {
    id: "mollusc",
    label: "Moluscos",
    terms: ["molusco", "moluscos", "mexilhao", "ostra", "lula", "polvo", "vieira"],
    tags: ["en:molluscs", "pt:moluscos", "es:moluscos", "fr:mollusques"],
  },
  {
    id: "sesame",
    label: "Gergelim",
    terms: ["gergelim", "sesamo", "tahine", "sesame"],
    tags: ["en:sesame-seeds", "pt:gergelim", "es:sesamo", "fr:sesame"],
  },
  {
    id: "mustard",
    label: "Mostarda",
    terms: ["mostarda", "mustard"],
    tags: ["en:mustard", "pt:mostarda", "es:mostaza", "fr:moutarde"],
  },
  {
    id: "sulphite",
    label: "Sulfitos",
    terms: ["sulfito", "sulfitos", "dioxido de enxofre", "metabissulfito", "sulphite"],
    tags: ["en:sulphur-dioxide-and-sulphites", "pt:sulfitos", "es:sulfitos"],
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
  { label: "Leite Moça", code: "7891000100103" },
];

const DEFAULT_ALLERGIES = ["milk", "gluten"];
const USERS_STORAGE_KEY = "nutriscan:users";
const SESSION_STORAGE_KEY = "nutriscan:session";
const GUEST_ALLERGIES_KEY = "nutriscan:guest-allergies";

// Carrega o ZXing só quando a câmera é ligada, e guarda o resultado para
// que ligar/desligar várias vezes não baixe nada de novo.
let scannerLibPromise = null;

function loadScannerLib() {
  if (!scannerLibPromise) {
    scannerLibPromise = Promise.all([import("@zxing/browser"), import("@zxing/library")]).then(
      ([browser, library]) => {
        const { BarcodeFormat, DecodeHintType, NotFoundException } = library;
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
          // Sem TRY_HARDER a leitura falha em embalagem curva (lata, garrafa).
          [DecodeHintType.TRY_HARDER, true],
        ]);
        return { BrowserMultiFormatReader: browser.BrowserMultiFormatReader, NotFoundException, hints };
      },
    );
  }
  return scannerLibPromise;
}

const CAMERA_ERROR_MESSAGES = {
  NotAllowedError:
    "Permissão da câmera negada. Clique no cadeado da barra de endereço, libere a Câmera e tente de novo.",
  NotFoundError:
    "Nenhuma câmera encontrada neste aparelho. Use o campo \"Digitar código manualmente\".",
  NotReadableError:
    "A câmera está sendo usada por outro programa. Feche o outro aplicativo e tente de novo.",
  OverconstrainedError:
    "Não encontrei uma câmera compatível. Tente pelo celular ou digite o código.",
  SecurityError: "O navegador bloqueou a câmera: a página precisa estar em HTTPS ou localhost.",
  AbortError: "A abertura da câmera foi interrompida. Tente novamente.",
};

function describeCameraError(error) {
  return CAMERA_ERROR_MESSAGES[error?.name] || "Não foi possível iniciar o scanner.";
}

function readStoredUsers() {
  try {
    const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
    const users = rawUsers ? JSON.parse(rawUsers) : [];
    if (!Array.isArray(users)) return [];
    // Um único item inválido no array quebrava a primeira renderização e deixava
    // a tela em branco, sem o usuário conseguir sequer limpar os dados.
    return users.filter(
      (user) => user && typeof user === "object" && typeof user.email === "string",
    );
  } catch {
    return [];
  }
}

function writeStoredUsers(users) {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    return true;
  } catch {
    return false; // cota cheia ou armazenamento bloqueado (navegação privada)
  }
}

const VALID_ALLERGY_IDS = new Set(ALLERGY_OPTIONS.map((option) => option.id));

function readStoredAllergies() {
  try {
    const rawAllergies = localStorage.getItem(GUEST_ALLERGIES_KEY);
    if (!rawAllergies) return DEFAULT_ALLERGIES;
    const allergies = JSON.parse(rawAllergies);
    if (!Array.isArray(allergies)) return DEFAULT_ALLERGIES;
    // Lista vazia é escolha legítima do usuário e precisa ser preservada.
    return allergies.filter((id) => VALID_ALLERGY_IDS.has(id));
  } catch {
    return DEFAULT_ALLERGIES;
  }
}

const PBKDF2_ITERATIONS = 210000;

function hasSecureCrypto() {
  return typeof crypto !== "undefined" && Boolean(crypto.subtle);
}

function generateId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex) {
  return Uint8Array.from(hex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
}

// SHA-256 puro é rápido demais e sem sal: a senha vira consulta de rainbow table.
// PBKDF2 com sal por usuário. `legacyHashPassword` continua existindo só para
// que contas criadas antes desta mudança ainda consigam entrar.
async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return { salt: saltHex || toHex(salt), hash: toHex(bits) };
}

async function legacyHashPassword(password) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return toHex(digest);
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

// Para exibição basta um campo, mas para procurar alergênico é preciso ler todos:
// as traduções da Open Food Facts não são redundantes. A Nutella, por exemplo,
// só declara a soja no texto em inglês.
function getAllergenText(product) {
  return [
    product?.ingredients_text_pt,
    product?.ingredients_text,
    product?.ingredients_text_en,
    typeof product?.ingredients === "string" ? product.ingredients : "",
    product?.traces,
  ]
    .filter(Boolean)
    .join(" \n ");
}

function formatNumber(value) {
  if (value === undefined || value === null || value === "") return null;

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: number < 1 ? 3 : 1,
  }).format(number);
}

const SODIUM_UNIT_TO_MG = { mg: 1, g: 1000, mcg: 0.001, "µg": 0.001, ug: 0.001 };

// A Open Food Facts entrega sódio em gramas. Converter pela unidade declarada,
// nunca pela magnitude do número: sal de cozinha tem 39,6 g de sódio por 100 g,
// e qualquer heurística do tipo "converte só se for menor que 10" o transforma
// em 39,6 mg — fazendo o app classificar sal puro como boa escolha.
function toSodiumMg(amount, unit) {
  const number = Number(amount);
  if (!Number.isFinite(number)) return null;
  const factor = SODIUM_UNIT_TO_MG[String(unit || "g").toLowerCase()] ?? 1000;
  return number * factor;
}

function getNutrientRows(nutriments) {
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

function getNutrientValue(product, key) {
  const nutriments = product?.nutriments || {};
  const value = nutriments[`${key}_100g`] ?? nutriments[key] ?? nutriments[`${key}_value`];

  if (key === "sodium") return toSodiumMg(value, nutriments.sodium_unit);

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const normalized = score ? String(score).toLowerCase() : "";
  // A API devolve "unknown"/"not-applicable"; não faz sentido exibir isso ao usuário.
  return ["a", "b", "c", "d", "e"].includes(normalized) ? normalized.toUpperCase() : "N/A";
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
  // Sempre com fronteira de palavra (aceitando plural): sem isso, "declaração"
  // casava com "clara" e o assistente respondia sobre alergia a ovo.
  const haystack = normalizeIntentText(query);
  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    return termRegex(normalizedTerm).test(haystack);
  });
}

// Busca textual: sem isto, procurar "nescau" ou "danone" não achava nada,
// porque só a base local de 8 alimentos era consultada.
async function searchProductsByName(term) {
  const params = new URLSearchParams({
    search_terms: term,
    countries_tags: "en:brazil",
    fields: PRODUCT_FIELDS,
    page_size: "12",
    sort_by: "unique_scans_n",
  });

  const response = await fetch(`${SEARCH_BASE}?${params}`, {
    headers: { Accept: "application/json" },
  });
  // 503/500 significa serviço indisponível, não "produto inexistente" — quem
  // chama precisa distinguir os dois para não mentir para o usuário.
  if (!response.ok) throw new Error(`Busca indisponível (HTTP ${response.status})`);

  const data = await response.json();
  return (data.products || [])
    .filter((item) => item.product_name || item.product_name_pt)
    .map((item) => ({ ...item, source: "Open Food Facts", isLocal: false }));
}

async function fetchProductByBarcode(barcode) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(barcode)}?fields=${PRODUCT_FIELDS}`,
    { headers: { Accept: "application/json" } },
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  // A v3 responde 404 com corpo estruturado quando o produto não existe.
  // Isso é "não encontrado", não é falha de rede.
  if (response.status === 404 || data?.result?.id === "product_not_found") return null;

  if (!response.ok) {
    throw new Error("A consulta falhou. Tente novamente.");
  }

  // Códigos UPC-A de 12 dígitos são normalizados pela API e voltam como
  // "success_with_warnings" — o produto existe e não pode ser descartado.
  const found = data?.status === "success" || data?.status === "success_with_warnings";
  if (!found || !data?.product) return null;

  return {
    ...data.product,
    source: "Open Food Facts",
    isLocal: false,
  };
}

// Trechos como "não contém glúten" ou "zero lactose" declaram AUSÊNCIA.
// Sem remover isso antes de procurar, o app alerta glúten em produto sem glúten.
const NEGATION_RE =
  /(nao contem|nao contem|nao possui|sem|zero|isento de|isenta de|livre de|free of|gluten free|lactose free)\s+[^,;.]{0,32}/g;

// A partir daqui o texto fala de contaminação cruzada, não de ingrediente.
const TRACE_SPLIT_RE =
  /pode conter|podem conter|pode ter|tracos de|traços de|may contain|elaborado em equipamento|produzido em equipamento|fabricado em equipamento/;

// Rótulos que afirmam ausência. A tag oficial de alergênico sempre vence isto.
const NEGATIVE_LABELS = {
  gluten: ["en:no-gluten", "en:gluten-free"],
  milk: ["en:no-lactose", "en:lactose-free", "en:no-milk", "en:milk-free"],
};

const TERM_REGEX_CACHE = new Map();

// Fronteira de palavra: evita casar "ovo" dentro de "novo" ou "nuts" dentro de "donuts".
function termRegex(term) {
  if (!TERM_REGEX_CACHE.has(term)) {
    const normalized = normalizeText(term)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "[\\s-]+");
    TERM_REGEX_CACHE.set(
      term,
      new RegExp(`(^|[^a-z0-9])${normalized}(s|es)?([^a-z0-9]|$)`),
    );
  }
  return TERM_REGEX_CACHE.get(term);
}

// Expressões em que o termo aparece mas NÃO indica o alergênico.
const ALLERGEN_EXCLUSIONS = {
  milk: [
    /leite\s+de\s+(coco|amendoas?|castanha|soja|aveia|arroz|amendoim)/,
    /manteiga\s+de\s+(cacau|amendoim|castanha)/,
    /(leite|bebida)\s+vegetal/,
  ],
};

function matchesAllergenTag(tags, option) {
  const known = [option.id, ...(option.tags || [])].map(normalizeText);
  return tags.some((tag) => known.includes(normalizeText(tag)));
}

function matchesAllergenText(option, haystack) {
  if (!haystack) return false;
  if ((ALLERGEN_EXCLUSIONS[option.id] || []).some((re) => re.test(haystack))) return false;
  return option.terms.some((term) => termRegex(term).test(haystack));
}

function scanAllergies(product, selectedAllergies) {
  if (!product) return { allRisks: [], profileRisks: [], hasData: false };

  const allergenTags = product.allergens_tags || [];
  const traceTags = product.traces_tags || [];
  const labelTags = (product.labels_tags || []).map(normalizeText);

  const text = normalizeText(getAllergenText(product)).replace(NEGATION_RE, " ");
  const splitAt = text.search(TRACE_SPLIT_RE);
  const containsText = splitAt === -1 ? text : text.slice(0, splitAt);
  const tracesText = splitAt === -1 ? "" : text.slice(splitAt);

  const allRisks = ALLERGY_OPTIONS.map((option) => {
    const declaredContains = matchesAllergenTag(allergenTags, option);
    const declaredTrace = matchesAllergenTag(traceTags, option);

    // Rótulo "sem glúten" derruba a suspeita vinda do texto, mas nunca a tag oficial.
    const deniedByLabel =
      !declaredContains &&
      !declaredTrace &&
      (NEGATIVE_LABELS[option.id] || []).some((label) => labelTags.includes(normalizeText(label)));
    if (deniedByLabel) return null;

    const isContains = declaredContains || matchesAllergenText(option, containsText);
    const isTrace = declaredTrace || matchesAllergenText(option, tracesText);
    if (!isContains && !isTrace) return null;

    return { ...option, severity: isContains ? "contains" : "traces" };
  }).filter(Boolean);

  return {
    allRisks,
    profileRisks: allRisks.filter((risk) => selectedAllergies.includes(risk.id)),
    // Distingue "analisei e está limpo" de "não tenho dados para analisar".
    hasData: Boolean(text.trim() || allergenTags.length || traceTags.length),
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

function buildAssistantAnswer(product, question, allergyScan = {}) {
  const profileRisks = allergyScan.profileRisks || [];
  const allRisks = allergyScan.allRisks || [];
  const hasAllergenData = allergyScan.hasData !== false;

  const query = normalizeText(question);
  const mentionedAllergies = getMentionedAllergies(query);
  const mentionedFood = getMentionedFood(query);

  // Alergia declarada na conversa que bate com alergênico detectado no produto.
  // Sem isto, quem diz "sou alérgico a leite" olhando um leite condensado
  // recebia "não apareceu conflito", porque só o perfil salvo era consultado.
  const mentionedIds = mentionedAllergies.map((item) => item.id || item);
  const conversationRisks = allRisks.filter((risk) => mentionedIds.includes(risk.id));
  const relevantRisks = [...profileRisks];
  conversationRisks.forEach((risk) => {
    if (!relevantRisks.some((item) => item.id === risk.id)) relevantRisks.push(risk);
  });

  const describeRisks = (risks) =>
    risks
      .map((risk) => (risk.severity === "traces" ? `${risk.label} (pode conter traços)` : risk.label))
      .join(", ");
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

    if (askedAllergyAdvice || mentionedAllergies.length || relevantRisks.length) {
      const allergyAnswer = relevantRisks.length
        ? `Atenção: eu encontrei possível relação com ${describeRisks(
            relevantRisks,
          )}. Evite se o rótulo confirmar "contém", "pode conter" ou derivados da sua alergia.`
        : buildAllergyAdvice(mentionedFood || name, mentionedAllergies, profileRisks);
      return `${ingredientAnswer}\n\n${allergyAnswer}`;
    }

    return ingredientAnswer;
  }

  if (askedAllergyAdvice) {
    if (relevantRisks.length) {
      return `${name} merece cuidado. Eu encontrei possível relação com ${describeRisks(
        relevantRisks,
      )}. Antes de comer, confira o rótulo físico e evite se aparecer "contém", "pode conter" ou derivados do ingrediente da sua alergia.`;
    }

    if (mentionedAllergies.length || mentionedFood) {
      const conclusion = hasAllergenData
        ? `Sobre ${name}: nos dados cadastrados não apareceu esse alergênico, mas isso não garante segurança — confira o rótulo físico antes de consumir.`
        : `Sobre ${name}: não consigo avaliar, porque este produto está sem lista de ingredientes e sem alergênicos cadastrados. Não dá para dizer se é seguro para você — leia o rótulo físico.`;
      return `${buildAllergyAdvice(mentionedFood || name, mentionedAllergies, profileRisks)}\n\n${conclusion}`;
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

    if (notes.length) {
      return `${name} merece atenção porque ${notes.join(", ")}. Eu olharia a porção e conferiria o rótulo físico antes de decidir.`;
    }
    return hasAllergenData
      ? `${name} não acendeu nenhum alerta forte com os dados cadastrados. Ainda assim, vale comparar porção, ingredientes e seu objetivo do momento.`
      : `${name} está sem ingredientes e sem alergênicos cadastrados na base, então não tenho como avaliar direito. Vale conferir o rótulo físico.`;
  }

  if (askedIdentity) {
    return `Eu sou o Nutri Assistente. Agora estou usando ${name} como contexto para responder suas perguntas de um jeito mais direto.`;
  }

  if (query.includes("alerg") || query.includes("posso comer")) {
    if (relevantRisks.length) {
      return `${name} merece cuidado. Encontrei ${describeRisks(
        relevantRisks,
      )} nos ingredientes ou nos alergênicos declarados. O rótulo físico precisa ser confirmado antes de consumir; se você já consumiu e tiver falta de ar, inchaço, urticária intensa, vômitos repetidos ou tontura, procure atendimento.`;
    }
    if (!hasAllergenData) {
      return `Não consigo avaliar ${name}: este produto está sem lista de ingredientes e sem alergênicos cadastrados na base. Não dá para dizer se é seguro para você — a única fonte confiável aqui é o rótulo físico.`;
    }
    return `${name} não bateu com as alergias marcadas, mas isso não garante segurança absoluta. Confira o rótulo físico, observe traços/contaminação cruzada e evite se você já teve reação a produto parecido.`;
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
  // Invalida buscas e aberturas de câmera que ficaram em voo quando outra começa.
  const searchTokenRef = useRef(0);
  const scannerRunIdRef = useRef(0);
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
    // Incrementar antes de parar invalida qualquer abertura de câmera ainda em voo,
    // impedindo que ela "ressuscite" o scanner depois que o usuário desligou.
    scannerRunIdRef.current += 1;
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

        // Não está na base local: procura na Open Food Facts pelo nome.
        setStatus({ type: "loading", message: `Procurando "${nextQuery}"...` });
        const token = ++searchTokenRef.current;

        try {
          const remoteMatches = await searchProductsByName(nextQuery);
          if (token !== searchTokenRef.current) return;

          if (!remoteMatches.length) {
            setStatus({
              type: "warning",
              message: `Não encontrei "${nextQuery}". Tente outro nome ou use o código de barras.`,
            });
            return;
          }

          setLocalMatches(remoteMatches);
          selectProduct(remoteMatches[0]);
          setStatus({
            type: "success",
            message: `${remoteMatches.length} resultado(s) na Open Food Facts.`,
          });
        } catch {
          if (token !== searchTokenRef.current) return;
          // A busca textual da Open Food Facts sai do ar com alguma frequência
          // (503). O código de barras usa outro endpoint e continua valendo.
          setStatus({
            type: "warning",
            message:
              "A busca por nome está indisponível no momento. Use o código de barras ou um dos exemplos.",
          });
        }
        return;
      }

      const barcode = cleanBarcode(nextQuery);
      setStatus({ type: "loading", message: `Buscando produto ${barcode}...` });

      const token = ++searchTokenRef.current;

      try {
        const foundProduct = await fetchProductByBarcode(barcode);
        if (token !== searchTokenRef.current) return; // uma busca mais nova já assumiu

        if (!foundProduct) {
          // Permite tentar o mesmo código de novo pelo scanner.
          lastDetectedRef.current = "";
          setStatus({
            type: "warning",
            message: `Produto ${barcode} não está cadastrado na Open Food Facts. Você pode buscar pelo nome ou conferir o rótulo.`,
          });
          return;
        }
        selectProduct(foundProduct);
      } catch {
        if (token !== searchTokenRef.current) return;
        lastDetectedRef.current = "";
        setStatus({
          type: "error",
          message: "Não foi possível consultar o produto. Verifique sua conexão e tente novamente.",
        });
      }
    },
    [selectProduct],
  );

  const startScanner = useCallback(async () => {
    if (scanControlsRef.current) return; // já está ligada

    // getUserMedia só existe em contexto seguro. Sem essa distinção, abrir o app
    // pelo IP da rede (para testar no celular) mostra "navegador não suporta",
    // quando o problema real é o protocolo.
    if (!window.isSecureContext) {
      setStatus({
        type: "error",
        message:
          "A câmera só funciona em HTTPS ou localhost. Neste endereço o navegador bloqueia o acesso — use o campo de código manual.",
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus({ type: "error", message: "Este navegador não suporta acesso à câmera." });
      return;
    }

    lastDetectedRef.current = "";
    setScannerState("starting");
    setStatus({ type: "loading", message: "Abrindo câmera..." });

    const runId = ++scannerRunIdRef.current;

    try {
      const { BrowserMultiFormatReader, NotFoundException, hints } = await loadScannerLib();

      // O download da biblioteca pode demorar; se desligaram nesse meio-tempo, para aqui.
      if (runId !== scannerRunIdRef.current) return;

      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error, currentControls) => {
          if (result) {
            const detectedBarcode = cleanBarcode(result.getText());
            if (!detectedBarcode || detectedBarcode === lastDetectedRef.current) return;

            lastDetectedRef.current = detectedBarcode;
            if (navigator.vibrate) navigator.vibrate(60);

            // Liberar a câmera assim que o código é lido: manter a captura viva
            // enquanto o usuário analisa o produto só gasta bateria.
            currentControls?.stop();
            scanControlsRef.current = null;
            scannerRunIdRef.current += 1;
            setScannerState("idle");

            searchProduct(detectedBarcode);
            return;
          }

          if (!error || error instanceof NotFoundException) return; // quadro sem código: normal

          // Qualquer outro erro encerra o loop da biblioteca. Sem tratar isso,
          // a interface continuaria dizendo "escaneando" com a câmera morta.
          currentControls?.stop();
          scanControlsRef.current = null;
          scannerRunIdRef.current += 1;
          setScannerState("idle");
          setStatus({
            type: "error",
            message: "A câmera foi interrompida. Ligue novamente ou digite o código.",
          });
        },
      );

      // O usuário pode ter desligado durante o tempo de permissão/abertura.
      if (runId !== scannerRunIdRef.current) {
        controls.stop();
        return;
      }

      scanControlsRef.current = controls;
      setScannerState("scanning");
      setStatus({ type: "ready", message: "Câmera ativa." });
    } catch (error) {
      setScannerState("idle");
      setStatus({ type: "error", message: describeCameraError(error) });
    }
  }, [searchProduct]);

  // A navegação é por estado, não por rota: sem este efeito, sair da aba Scan
  // deixa a câmera ligada indefinidamente.
  useEffect(() => {
    if (activePage !== "scan") stopScanner();
    return () => stopScanner();
  }, [activePage, stopScanner]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) stopScanner();
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, [stopScanner]);

  // Volta ao topo depois que a nova página renderizou. Feito no efeito, e não
  // no clique, porque no clique o conteúdo antigo ainda está na tela.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [activePage]);

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
    // Espelha sempre no armazenamento local: sem isso, uma alergia marcada
    // durante a sessão logada desaparecia silenciosamente ao sair da conta.
    try {
      localStorage.setItem(GUEST_ALLERGIES_KEY, JSON.stringify(nextAllergies));
    } catch {
      /* armazenamento indisponível: a seleção continua valendo nesta sessão */
    }

    if (!currentUser) return;

    const storedUsers = readStoredUsers();
    if (!storedUsers.some((user) => user.email === currentUser.email)) {
      setAuthStatus({
        type: "error",
        message: "Não consegui salvar suas alergias na conta. Entre novamente.",
      });
      return;
    }

    const nextUsers = storedUsers.map((user) =>
      user.email === currentUser.email ? { ...user, allergies: nextAllergies } : user,
    );

    if (!writeStoredUsers(nextUsers)) {
      setAuthStatus({
        type: "error",
        message: "Não consegui salvar suas alergias. O armazenamento pode estar cheio.",
      });
      return;
    }

    setUsers(nextUsers);
    setCurrentUser((user) => (user ? { ...user, allergies: nextAllergies } : user));
  };

  // O updater de estado precisa ser puro — o efeito colateral saiu de dentro dele.
  const toggleAllergy = (id) => {
    const nextAllergies = selectedAllergies.includes(id)
      ? selectedAllergies.filter((item) => item !== id)
      : [...selectedAllergies, id];

    setSelectedAllergies(nextAllergies);
    saveAllergiesForSession(nextAllergies);
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

    // crypto.subtle não existe fora de HTTPS/localhost. Sem este aviso, abrir o
    // app pelo IP da rede fazia o botão simplesmente não responder.
    if (!hasSecureCrypto()) {
      setAuthStatus({
        type: "error",
        message:
          "Login indisponível neste endereço: abra o app por https:// ou http://localhost. Pelo IP da rede o navegador bloqueia a criptografia.",
      });
      return;
    }

    // Relê do armazenamento em vez de usar o estado, que pode estar velho
    // se houver outra aba aberta — antes isso apagava contas.
    const storedUsers = readStoredUsers();

    if (authMode === "register") {
      const alreadyExists = storedUsers.some((user) => {
        const emailKey = normalizeText(user.email);
        const nameKey = normalizeText(user.name);
        return (
          [emailKey, nameKey].includes(normalizeText(email)) ||
          [emailKey, nameKey].includes(normalizeText(name))
        );
      });

      if (alreadyExists) {
        setAuthStatus({
          type: "warning",
          message: "Já existe uma conta com esse e-mail ou usuário.",
        });
        return;
      }

      let credentials;
      try {
        credentials = await hashPassword(password);
      } catch {
        setAuthStatus({ type: "error", message: "Falha ao processar a senha. Tente novamente." });
        return;
      }

      const newUser = {
        id: generateId(),
        name,
        email,
        passwordSalt: credentials.salt,
        passwordHash: credentials.hash,
        allergies: selectedAllergies,
        createdAt: new Date().toISOString(),
      };
      const nextUsers = [...storedUsers, newUser];

      if (!writeStoredUsers(nextUsers)) {
        setAuthStatus({
          type: "error",
          message:
            "Não consegui salvar seus dados. O armazenamento do navegador pode estar cheio ou bloqueado.",
        });
        return;
      }

      setUsers(nextUsers);
      localStorage.setItem(SESSION_STORAGE_KEY, newUser.email);
      setCurrentUser(getPublicUser(newUser));
      setAuthForm({ name: "", email: "", password: "" });
      setAuthStatus({
        type: "success",
        message: "Conta criada. Suas alergias foram salvas nesse perfil.",
      });
      return;
    }

    // Prioriza o e-mail: um usuário cujo NOME seja o e-mail de outro não deve
    // sequestrar o login alheio.
    const foundUser =
      storedUsers.find((user) => normalizeText(user.email) === normalizeText(email)) ||
      findUserByIdentifier(storedUsers, email);

    let passwordMatches = false;
    try {
      if (foundUser?.passwordSalt) {
        const { hash } = await hashPassword(password, foundUser.passwordSalt);
        passwordMatches = hash === foundUser.passwordHash;
      } else if (foundUser) {
        // Conta criada antes do PBKDF2: valida pelo formato antigo.
        passwordMatches = (await legacyHashPassword(password)) === foundUser.passwordHash;
      }
    } catch {
      setAuthStatus({ type: "error", message: "Falha ao verificar a senha. Tente novamente." });
      return;
    }

    if (!foundUser || !passwordMatches) {
      setAuthStatus({
        type: "error",
        message: "Usuário, e-mail ou senha inválidos.",
      });
      return;
    }

    // Migra a conta antiga para PBKDF2 no primeiro login bem-sucedido.
    let userToStore = foundUser;
    if (!foundUser.passwordSalt) {
      try {
        const credentials = await hashPassword(password);
        userToStore = {
          ...foundUser,
          passwordSalt: credentials.salt,
          passwordHash: credentials.hash,
        };
        const migrated = storedUsers.map((user) =>
          user.email === foundUser.email ? userToStore : user,
        );
        if (writeStoredUsers(migrated)) setUsers(migrated);
      } catch {
        userToStore = foundUser; // migração é oportunista; o login continua válido
      }
    }

    localStorage.setItem(SESSION_STORAGE_KEY, userToStore.email);
    setCurrentUser(getPublicUser(userToStore));
    setSelectedAllergies(
      Array.isArray(userToStore.allergies) ? userToStore.allergies : DEFAULT_ALLERGIES,
    );
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
      message: "Analisando o rótulo...",
    });

    // Pausa curta só para a resposta não aparecer no mesmo quadro em que a
    // pergunta foi enviada. A análise é local e instantânea — não há chamada
    // de rede para esperar, e fingir latência de IA seria enganoso.
    await new Promise((resolve) => {
      window.setTimeout(resolve, 120);
    });

    const answer = buildAssistantAnswer(product, question, allergyScan);
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
    // pushState (e não replaceState) para o botão Voltar do Android voltar
    // à tela anterior em vez de sair do app.
    if (page !== activePage) window.history.pushState(null, "", `#${page}`);
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
                    {risk.severity === "traces" ? `Pode conter ${risk.label}` : risk.label}
                  </span>
                ))
              ) : allergyScan.hasData ? (
                <span className="quiet-tag">Sem conflito com o perfil</span>
              ) : (
                <span className="danger-tag">
                  Sem dados de alergênicos — confira o rótulo físico
                </span>
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
                    {risk.severity === "traces" ? `Pode conter ${risk.label}` : risk.label}
                  </span>
                ))
              ) : allergyScan.hasData ? (
                <span className="quiet-tag">Nenhum alergênico detectado</span>
              ) : (
                <span className="quiet-tag">Produto sem ingredientes cadastrados na base</span>
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
          <h3>Assistente</h3>
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
      <div className={`status-line ${status.type}`} role="status" aria-live="polite">
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
          <div className={`status-line ${status.type}`} role="status" aria-live="polite">
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
        <p className="eyebrow dark">Assistente</p>
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
        <p className="assistant-disclaimer">
          Orientação informativa, baseada em dados públicos de rótulo que podem estar incompletos ou
          desatualizados. Não substitui avaliação de médico ou nutricionista. Em caso de reação
          alérgica, procure atendimento.
        </p>
        <div className={`assistant-status ${assistantConnection.type}`} role="status" aria-live="polite">
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
        <div className="chat-log" ref={chatLogRef} role="log" aria-live="polite">
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
            {/* Sem role="tab"/aria-selected nos filhos, declarar "tablist" confunde
                mais o leitor de tela do que não ter ARIA nenhum. */}
            <div className="auth-tabs" aria-label="Tipo de acesso">
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

            <div className={`status-line ${authStatus.type}`} role="status" aria-live="polite">
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
              <span>Assistente usando o perfil e o produto atual.</span>
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
    { id: "chat", label: "Assistente", icon: Bot },
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
                aria-current={activePage === item.id ? "page" : undefined}
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

        <div className={`status-line ${status.type}`} role="status" aria-live="polite">
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


