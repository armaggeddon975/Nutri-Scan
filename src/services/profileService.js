import { apiRequest } from "./apiClient";

export function updateProfileAllergies(allergies) {
  return apiRequest("/api/profile/allergies", {
    method: "PUT",
    body: { allergies },
  });
}
