import { apiRequest } from "./apiClient";

export function getMe() {
  return apiRequest("/api/auth/me", { timeoutMs: 6000 });
}

export function registerAccount(payload) {
  return apiRequest("/api/auth/register", {
    method: "POST",
    body: payload,
  });
}

export function loginAccount(payload) {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: payload,
  });
}

export function logoutAccount() {
  return apiRequest("/api/auth/logout", {
    method: "POST",
    timeoutMs: 5000,
  });
}
