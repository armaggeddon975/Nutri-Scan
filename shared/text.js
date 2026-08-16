const TERM_REGEX_CACHE = new Map();

export function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeIntentText(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function termRegex(term) {
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
