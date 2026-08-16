import { z } from "zod";

import { isValidAllergyId } from "../config/allergies.js";
import { normalizeEmail, normalizeNameKey } from "./normalize.js";

const allergySchema = z
  .array(z.string())
  .default([])
  .transform((items) => [...new Set(items)])
  .refine((items) => items.every(isValidAllergyId), {
    message: "Lista de alergias contém item inválido.",
  });

const nameSchema = z
  .string()
  .trim()
  .min(2, "Usuário deve ter pelo menos 2 caracteres.")
  .max(80, "Usuário muito longo.");

const emailSchema = z
  .string()
  .trim()
  .email("E-mail inválido.")
  .max(160, "E-mail muito longo.")
  .transform(normalizeEmail);

const passwordSchema = z
  .string()
  .min(6, "Use uma senha com pelo menos 6 caracteres.")
  .max(200, "Senha muito longa.");

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  allergies: allergySchema,
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(160),
  password: passwordSchema,
});

export const allergiesUpdateSchema = z.object({
  allergies: allergySchema,
});

export function validateRegister(input) {
  const result = registerSchema.parse(input);
  return { ...result, nameKey: normalizeNameKey(result.name) };
}

export function validateLogin(input) {
  const result = loginSchema.parse(input);
  return { ...result, identifierKey: normalizeNameKey(result.identifier) };
}

export function validateAllergiesUpdate(input) {
  return allergiesUpdateSchema.parse(input);
}
