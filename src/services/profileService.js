import { apiRequest } from "./apiClient";

// `alertLevels` (v0.9.0) vai so com as alergias em alerta maximo. Alergia
// ausente do mapa e gravada como `standard`, que e o padrao do backend.
export function updateProfileAllergies(allergies, alertLevels = {}) {
  const strictOnly = Object.fromEntries(
    Object.entries(alertLevels).filter(([id, level]) => level === "strict" && allergies.includes(id)),
  );
  return apiRequest("/api/profile/allergies", {
    method: "PUT",
    body: { allergies, alertLevels: strictOnly },
  });
}
