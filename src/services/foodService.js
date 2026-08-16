import { LOCAL_FOODS } from "../data/foods";
import { toLocalProduct } from "../utils/product";
import { normalizeText } from "../utils/text";

export function findLocalFoods(query) {
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
