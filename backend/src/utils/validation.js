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

// -----------------------------------------------------------------------
// Historico e favoritos
// -----------------------------------------------------------------------
//
// Nome e marca vem da Open Food Facts, que e fonte NAO CONFIAVEL. A validacao
// aqui limita tamanho e tipo; ela nao "limpa" o conteudo, porque nao ha como
// saber o que e legitimo num nome de produto. A protecao de exibicao e o
// React, que escapa texto por padrao, e a de IA e o contexto, que trata esses
// campos como dado e nunca como instrucao.
//
// O codigo do produto aceita letra alem de digito: a maior parte dos codigos e
// EAN numerico, mas a base tem cadastros com sufixo alfanumerico.
const productCodeSchema = z
  .string()
  .trim()
  .min(1, "Código do produto é obrigatório.")
  .max(64, "Código do produto muito longo.")
  .regex(/^[A-Za-z0-9._-]+$/, "Código do produto tem caractere inválido.");

const productNameSchema = z
  .string()
  .trim()
  .min(1, "Nome do produto é obrigatório.")
  .max(300, "Nome do produto muito longo.");

const productBrandSchema = z
  .string()
  .trim()
  .max(200, "Marca muito longa.")
  .optional()
  .nullable()
  .transform((valor) => valor || null);

// A imagem so pode ser https. A CSP de producao ja restringe `img-src` aos
// dominios da Open Food Facts, entao uma URL de outro lugar simplesmente nao
// carrega; validar aqui evita guardar lixo no banco.
const imageUrlSchema = z
  .string()
  .trim()
  .max(500, "URL de imagem muito longa.")
  .url("URL de imagem inválida.")
  .refine((valor) => valor.startsWith("https://"), "URL de imagem precisa ser https.")
  .optional()
  .nullable()
  .transform((valor) => valor || null);

export const productRefSchema = z.object({
  productCode: productCodeSchema,
  productName: productNameSchema,
  productBrand: productBrandSchema,
  imageUrl: imageUrlSchema,
});

// `id` de item e sempre uuid. Recusar formato invalido antes de chegar ao banco
// evita que texto arbitrario vire erro de SQL - e erro de SQL vazando para o
// cliente conta a ele que a tabela existe.
export const itemIdSchema = z.string().uuid("Identificador inválido.");
