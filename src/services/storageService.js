import { DEFAULT_ALLERGIES, VALID_ALLERGY_IDS } from "../data/allergens";

// Prefixo "nutriscan:" preservado de proposito na renomeacao para NutriVa.
// Estas chaves vivem no localStorage do navegador de quem ja usa o app: trocar
// o prefixo nao migra nada, apenas faz o app deixar de encontrar as alergias e
// as contas locais ja salvas. O nome interno nao vaza para a interface.
export const USERS_STORAGE_KEY = "nutriscan:users";
export const GUEST_ALLERGIES_KEY = "nutriscan:guest-allergies";

export function readStoredUsers() {
  try {
    const rawUsers = localStorage.getItem(USERS_STORAGE_KEY);
    const users = rawUsers ? JSON.parse(rawUsers) : [];
    if (!Array.isArray(users)) return [];
    return users.filter(
      (user) => user && typeof user === "object" && typeof user.email === "string",
    );
  } catch {
    return [];
  }
}

export function readStoredAllergies() {
  try {
    const rawAllergies = localStorage.getItem(GUEST_ALLERGIES_KEY);
    if (!rawAllergies) return DEFAULT_ALLERGIES;
    const allergies = JSON.parse(rawAllergies);
    if (!Array.isArray(allergies)) return DEFAULT_ALLERGIES;
    return allergies.filter((id) => VALID_ALLERGY_IDS.has(id));
  } catch {
    return DEFAULT_ALLERGIES;
  }
}

export function writeStoredAllergies(allergies) {
  try {
    localStorage.setItem(GUEST_ALLERGIES_KEY, JSON.stringify(allergies));
    return true;
  } catch {
    return false;
  }
}
