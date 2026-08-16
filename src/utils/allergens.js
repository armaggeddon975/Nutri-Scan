import { analyzeProductAllergens } from "../../shared/allergenEngine.js";

export function scanAllergies(product, selectedAllergies) {
  if (!product) return { allRisks: [], profileRisks: [], hasData: false };
  return analyzeProductAllergens(product, selectedAllergies);
}
