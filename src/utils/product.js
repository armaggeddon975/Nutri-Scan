export function toLocalProduct(food) {
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

export function getProductName(product) {
  return (
    product?.product_name_pt ||
    product?.product_name ||
    product?.product_name_en ||
    "Produto sem nome"
  );
}

export function getIngredients(product) {
  return (
    product?.ingredients_text_pt ||
    product?.ingredients_text ||
    product?.ingredients_text_en ||
    product?.ingredients ||
    ""
  );
}

export function getAllergenText(product) {
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
