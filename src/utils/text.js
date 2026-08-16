import { normalizeIntentText, normalizeText, termRegex } from "../../shared/text.js";

export { normalizeIntentText, normalizeText, termRegex };

export function cleanBarcode(value = "") {
  return value.replace(/[^\d]/g, "").slice(0, 18);
}

export function isBarcodeQuery(value) {
  return /^\d{6,18}$/.test(cleanBarcode(value));
}

export function hasAnyTerm(query, terms) {
  const normalizedQuery = normalizeIntentText(query);

  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escapedTerm}(\\s|$)`).test(normalizedQuery);
  });
}

export function hasTextIntent(query, terms) {
  const haystack = normalizeIntentText(query);
  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    return termRegex(normalizedTerm).test(haystack);
  });
}
