import { withTransaction } from "../database/pool.js";
import { findUserById, getUserAllergyProfile, replaceUserAllergies } from "../repositories/userRepository.js";
import { AppError } from "../utils/AppError.js";
import { toPublicUser } from "../utils/normalize.js";
import { validateAllergiesUpdate } from "../utils/validation.js";

export async function getProfile(userId) {
  const user = await findUserById(userId);
  if (!user) throw new AppError("NOT_FOUND", "Perfil não encontrado.", 404);
  const { allergies, alertLevels } = await getUserAllergyProfile(userId);
  return toPublicUser(user, allergies, alertLevels);
}

// O corpo pode trazer `alertLevels` (v0.9.0). A identidade continua vindo so
// de `userId`, que o controller tira da sessao; `user_id` no corpo e descartado
// pela validacao.
export async function updateAllergies(userId, input) {
  const { allergies, alertLevels } = validateAllergiesUpdate(input);

  return withTransaction(async (client) => {
    const user = await findUserById(userId, client);
    if (!user) throw new AppError("NOT_FOUND", "Perfil não encontrado.", 404);
    await replaceUserAllergies(userId, allergies, client, alertLevels);
    const perfil = await getUserAllergyProfile(userId, client);
    return toPublicUser(user, perfil.allergies, perfil.alertLevels);
  });
}
