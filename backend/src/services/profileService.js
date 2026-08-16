import { withTransaction } from "../database/pool.js";
import { findUserById, getUserAllergies, replaceUserAllergies } from "../repositories/userRepository.js";
import { AppError } from "../utils/AppError.js";
import { toPublicUser } from "../utils/normalize.js";
import { validateAllergiesUpdate } from "../utils/validation.js";

export async function getProfile(userId) {
  const user = await findUserById(userId);
  if (!user) throw new AppError("NOT_FOUND", "Perfil não encontrado.", 404);
  const allergies = await getUserAllergies(userId);
  return toPublicUser(user, allergies);
}

export async function updateAllergies(userId, input) {
  const { allergies } = validateAllergiesUpdate(input);

  return withTransaction(async (client) => {
    const user = await findUserById(userId, client);
    if (!user) throw new AppError("NOT_FOUND", "Perfil não encontrado.", 404);
    const nextAllergies = await replaceUserAllergies(userId, allergies, client);
    return toPublicUser(user, nextAllergies);
  });
}
