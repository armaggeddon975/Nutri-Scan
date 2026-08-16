export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function normalizeNameKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function toPublicUser(user, allergies = []) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    allergies,
    createdAt: user.created_at || user.createdAt,
  };
}
