export const ALLERGY_DEFINITIONS = [
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
    label: "Gluten",
    terms: ["gluten", "trigo", "farinha de trigo", "cevada", "centeio", "aveia", "malte", "celiaco"],
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
    label: "Crustaceos",
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

export const ALLERGY_IDS = ALLERGY_DEFINITIONS.map((option) => option.id);
export const VALID_ALLERGY_IDS = new Set(ALLERGY_IDS);
export const DEFAULT_ALLERGIES = [];

export function isValidAllergyId(id) {
  return VALID_ALLERGY_IDS.has(id);
}

export function filterValidAllergies(allergies) {
  return [...new Set(Array.isArray(allergies) ? allergies : [])].filter(isValidAllergyId);
}
