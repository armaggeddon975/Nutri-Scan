import { ALLERGY_DEFINITIONS } from "./allergens.js";
import { getProductAllergenInput } from "./productAllergenAdapter.js";
import { normalizeText } from "./text.js";

export const OCCURRENCE_CLASSIFICATION = {
  NEGATED: "negated",
  CONTAINS: "contains",
  TRACE: "traces",
};

export const NEGATION_MARKERS = [
  "nao contem",
  "nao possui",
  "sem",
  "zero",
  "isento de",
  "isenta de",
  "livre de",
  "free of",
];

export const DIRECT_NEGATIVE_PATTERNS = ["gluten free", "lactose free"];

export const TRACE_MARKERS = [
  "pode conter",
  "podem conter",
  "pode ter",
  "tracos de",
  "traces of",
  "may contain",
  "elaborado em equipamento",
  "produzido em equipamento",
  "fabricado em equipamento",
];

export const POSITIVE_MARKERS = ["contem", "possui", "com", "ingredientes", "ingrediente"];

export const NEGATIVE_LABELS = {
  gluten: ["en:no-gluten", "en:gluten-free"],
  milk: ["en:no-lactose", "en:lactose-free", "en:no-milk", "en:milk-free"],
};

export const ALLERGEN_EXCLUSIONS = {
  milk: [
    /leite\s+de\s+(coco|amendoas?|castanha|soja|aveia|arroz|amendoim)/g,
    /manteiga\s+de\s+(cacau|amendoim|castanha)/g,
    /(leite|bebida)\s+vegetal/g,
  ],
};

function escapeRegex(value) {
  return normalizeText(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "[\\s-]+");
}

function phraseRegex(phrase) {
  return new RegExp(`(^|[^a-z0-9])(${escapeRegex(phrase)})(?=$|[^a-z0-9])`, "g");
}

function termOccurrenceRegex(term) {
  return new RegExp(`(^|[^a-z0-9])(${escapeRegex(term)}(?:s|es)?)(?=$|[^a-z0-9])`, "g");
}

function findPhraseRanges(text, phrases, type) {
  const ranges = [];
  for (const phrase of phrases) {
    const re = phraseRegex(phrase);
    for (const match of text.matchAll(re)) {
      const start = match.index + match[1].length;
      const end = start + match[2].length;
      ranges.push({ start, end, phrase, type });
    }
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

function findTermOccurrences(text, term) {
  const occurrences = [];
  const re = termOccurrenceRegex(term);
  for (const match of text.matchAll(re)) {
    const start = match.index + match[1].length;
    const end = start + match[2].length;
    occurrences.push({ start, end, term });
  }
  return occurrences;
}

function lastHardBoundaryBefore(text, index) {
  const boundary = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf(";", index - 1),
    text.lastIndexOf("\n", index - 1),
    text.lastIndexOf("\r", index - 1),
    text.lastIndexOf("!", index - 1),
    text.lastIndexOf("?", index - 1),
  );
  return boundary === -1 ? 0 : boundary + 1;
}

function isInsideRange(occurrence, ranges) {
  return ranges.some((range) => occurrence.start >= range.start && occurrence.end <= range.end);
}

function getExclusionRanges(option, text) {
  const ranges = [];
  for (const re of ALLERGEN_EXCLUSIONS[option.id] || []) {
    for (const match of text.matchAll(re)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

function isDirectlyNegatedPhrase(text, occurrence) {
  return findPhraseRanges(text, DIRECT_NEGATIVE_PATTERNS, OCCURRENCE_CLASSIFICATION.NEGATED).some(
    (range) => occurrence.start >= range.start && occurrence.end <= range.end,
  );
}

function collectLocalMarkers(text, occurrence) {
  const segmentStart = lastHardBoundaryBefore(text, occurrence.start);
  const context = text.slice(segmentStart, occurrence.start);
  const negationRanges = findPhraseRanges(context, NEGATION_MARKERS, OCCURRENCE_CLASSIFICATION.NEGATED);
  const traceRanges = findPhraseRanges(context, TRACE_MARKERS, OCCURRENCE_CLASSIFICATION.TRACE);
  const positiveRanges = findPhraseRanges(context, POSITIVE_MARKERS, OCCURRENCE_CLASSIFICATION.CONTAINS).filter(
    (range) => !isInsideRange(range, negationRanges) && !isInsideRange(range, traceRanges),
  );

  return [...negationRanges, ...traceRanges, ...positiveRanges].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
}

export function classifyTermOccurrence(text, occurrence, option) {
  const normalizedText = normalizeText(text);
  const normalizedOccurrence =
    typeof occurrence.start === "number"
      ? occurrence
      : findTermOccurrences(normalizedText, occurrence.term || occurrence)[0];

  if (!normalizedOccurrence) return null;
  if (isInsideRange(normalizedOccurrence, getExclusionRanges(option, normalizedText))) return null;
  if (isDirectlyNegatedPhrase(normalizedText, normalizedOccurrence)) {
    return OCCURRENCE_CLASSIFICATION.NEGATED;
  }

  const markers = collectLocalMarkers(normalizedText, normalizedOccurrence);
  const marker = markers[markers.length - 1];
  if (!marker) return OCCURRENCE_CLASSIFICATION.CONTAINS;
  return marker.type;
}

function matchesAllergenTag(tags, option) {
  const known = [option.id, ...(option.tags || [])].map(normalizeText);
  return tags.some((tag) => known.includes(normalizeText(tag)));
}

function hasNegativeLabel(labelTags, option) {
  const normalizedLabelTags = labelTags.map(normalizeText);
  return (NEGATIVE_LABELS[option.id] || []).some((label) => normalizedLabelTags.includes(normalizeText(label)));
}

function classifyAllergenText(option, text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  let sawTrace = false;
  for (const term of option.terms) {
    for (const occurrence of findTermOccurrences(normalizedText, term)) {
      const classification = classifyTermOccurrence(normalizedText, occurrence, option);
      if (classification === OCCURRENCE_CLASSIFICATION.CONTAINS) return "contains";
      if (classification === OCCURRENCE_CLASSIFICATION.TRACE) sawTrace = true;
    }
  }
  return sawTrace ? "traces" : null;
}

function hasSectionTerm(option, text) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return false;

  const exclusionRanges = getExclusionRanges(option, normalizedText);
  return option.terms.some((term) =>
    findTermOccurrences(normalizedText, term).some((occurrence) => !isInsideRange(occurrence, exclusionRanges)),
  );
}

export function analyzeAllergens({
  allergenTags = [],
  traceTags = [],
  labelTags = [],
  text = "",
  ingredientText = text,
  declaredAllergenText = "",
  traceText = "",
  selectedAllergies = [],
} = {}) {
  const normalizedIngredientText = normalizeText(ingredientText);
  const normalizedDeclaredAllergenText = normalizeText(declaredAllergenText);
  const normalizedTraceText = normalizeText(traceText);

  const allRisks = ALLERGY_DEFINITIONS.map((option) => {
    const declaredContains = matchesAllergenTag(allergenTags, option);
    const declaredTrace = matchesAllergenTag(traceTags, option);
    const ingredientSeverity = classifyAllergenText(option, normalizedIngredientText);
    const declaredTextContains = hasSectionTerm(option, normalizedDeclaredAllergenText);
    const traceTextMatch = hasSectionTerm(option, normalizedTraceText);
    const negativeLabelOnly = hasNegativeLabel(labelTags, option);

    const severity = declaredContains || declaredTextContains || ingredientSeverity === "contains"
      ? "contains"
      : declaredTrace || traceTextMatch || ingredientSeverity === "traces"
        ? "traces"
        : null;

    if (!severity) {
      if (negativeLabelOnly) return null;
      return null;
    }

    return { ...option, severity };
  }).filter(Boolean);

  return {
    allRisks,
    profileRisks: allRisks.filter((risk) => selectedAllergies.includes(risk.id)),
    hasData: Boolean(
      normalizedIngredientText.trim() ||
        normalizedDeclaredAllergenText.trim() ||
        normalizedTraceText.trim() ||
        allergenTags.length ||
        traceTags.length ||
        labelTags.length,
    ),
  };
}

export function analyzeProductAllergens(product, selectedAllergies = []) {
  return analyzeAllergens({
    ...getProductAllergenInput(product),
    selectedAllergies,
  });
}
