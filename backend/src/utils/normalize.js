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

// `alertLevels` (v0.9.0) traz uma entrada para CADA alergia de `allergies`,
// `standard` incluida: quem le nao precisa saber qual e o padrao. Alergia sem
// entrada no mapa recebido sai como `standard`, que e o default da coluna.
export function toPublicUser(user, allergies = [], alertLevels = {}) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    allergies,
    alertLevels: Object.fromEntries(
      allergies.map((allergyId) => [
        allergyId,
        Object.prototype.hasOwnProperty.call(alertLevels, allergyId) ? alertLevels[allergyId] : "standard",
      ]),
    ),
    createdAt: user.created_at || user.createdAt,
  };
}
