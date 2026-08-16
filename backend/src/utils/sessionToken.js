import { createHash, randomBytes, randomUUID } from "node:crypto";

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateId() {
  return randomUUID();
}

export function getSessionExpiration(ttlDays) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);
  return expiresAt;
}
