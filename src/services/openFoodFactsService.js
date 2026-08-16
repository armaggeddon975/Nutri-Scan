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

export async function searchProductsByName(term) {
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
  if (!response.ok) throw new Error(`Busca indisponível (HTTP ${response.status})`);

  const data = await response.json();
  return (data.products || [])
    .filter((item) => item.product_name || item.product_name_pt)
    .map((item) => ({ ...item, source: "Open Food Facts", isLocal: false }));
}

export async function fetchProductByBarcode(barcode) {
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

  if (response.status === 404 || data?.result?.id === "product_not_found") return null;

  if (!response.ok) {
    throw new Error("A consulta falhou. Tente novamente.");
  }

  const found = data?.status === "success" || data?.status === "success_with_warnings";
  if (!found || !data?.product) return null;

  return {
    ...data.product,
    source: "Open Food Facts",
    isLocal: false,
  };
}
