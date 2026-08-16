function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinTextParts(parts) {
  return parts
    .flatMap((part) => {
      if (!part) return [];
      if (Array.isArray(part)) return part.map(String);
      return [String(part)];
    })
    .filter(Boolean)
    .join(" \n ");
}

export function getProductAllergenText(product = {}) {
  const source = product || {};
  return joinTextParts([
    source.ingredients_text_pt,
    source.ingredients_text,
    source.ingredients_text_en,
    source.ingredients,
  ]);
}

export function getProductAllergenInput(product = {}) {
  const source = product || {};
  return {
    allergenTags: asArray(source.allergens_tags || source.allergenTags),
    traceTags: asArray(source.traces_tags || source.traceTags),
    labelTags: asArray(source.labels_tags || source.labelTags || source.labels),
    ingredientText: getProductAllergenText(source),
    declaredAllergenText: joinTextParts([source.allergens]),
    traceText: joinTextParts([source.traces]),
  };
}
