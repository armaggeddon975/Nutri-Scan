import { z } from "zod";

import { isValidAllergyId } from "../config/allergies.js";
import { AppError } from "../utils/AppError.js";

export const MAX_MESSAGE_CHARS = 1200;
export const MAX_CONVERSATION_TURNS = 10;
export const MAX_CONVERSATION_CHARS = 6000;
export const MAX_TEXT_FIELD_CHARS = 1200;

const roleSchema = z.enum(["user", "assistant"]);

const conversationItemSchema = z.object({
  role: roleSchema,
  text: z.string().trim().max(MAX_MESSAGE_CHARS).default(""),
});

const productSchema = z
  .object({
    barcode: z.string().optional(),
    code: z.string().optional(),
    name: z.string().optional(),
    product_name: z.string().optional(),
    brand: z.string().optional(),
    brands: z.string().optional(),
    ingredients: z.string().optional(),
    ingredients_text: z.string().optional(),
    allergens: z.union([z.array(z.string()), z.string()]).optional(),
    traces: z.union([z.array(z.string()), z.string()]).optional(),
    nutriments: z.record(z.any()).optional(),
    nutriscore: z.string().optional(),
    nutriscore_grade: z.string().optional(),
    quantity: z.string().optional(),
    servingSize: z.string().optional(),
    serving_size: z.string().optional(),
  })
  .passthrough()
  .optional()
  .nullable();

export const assistantChatSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  conversation: z.array(conversationItemSchema).default([]),
  product: productSchema,
  guestAllergies: z
    .array(z.string())
    .default([])
    .transform((items) => [...new Set(items)])
    .refine((items) => items.every(isValidAllergyId), {
      message: "Lista de alergias contem item invalido.",
    }),
});

export function validateAssistantChat(input) {
  const data = assistantChatSchema.parse(input);
  return {
    ...data,
    conversation: limitConversation(data.conversation),
  };
}

export function trimText(value, max = MAX_TEXT_FIELD_CHARS) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeText(value) {
  return trimText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function limitConversation(conversation) {
  const recent = conversation
    .filter((item) => item?.role && item?.text)
    .slice(-MAX_CONVERSATION_TURNS);
  let total = 0;
  const limited = [];

  for (const item of recent.reverse()) {
    total += item.text.length;
    if (total > MAX_CONVERSATION_CHARS) break;
    limited.push(item);
  }

  return limited.reverse();
}

export function isUrgentHealthQuestion(message) {
  const text = normalizeText(message);
  const breathing = /falta de ar|nao consigo respirar|dificuldade para respirar|respirar/.test(text);
  const swelling = /inchaco|inchou|inchada|inchado|lingua|garganta|rosto|garganta.*fechando|fechando/.test(text);
  const severe = /desmaio|desmai|desmaiando|anafil|reacao intensa|piorando rapido|emergencia|passando mal/.test(text);
  if (/garganta.*fechando|lingua.*inch|inch.*lingua|falta de ar.*comi|falta de ar.*comer/.test(text)) {
    return true;
  }
  return (breathing && swelling) || severe;
}

export function isOutOfScopeQuestion(message) {
  const text = normalizeText(message);
  const hasFoodContext = /leite|alimento|comida|nutri|rotulo|ingrediente|alerg|proteina|acucar|gordura|gluten|lactose|comer|bebida/.test(
    text,
  );
  if (hasFoodContext) return false;
  return /hackear|roubar senha|invadir|cartao clonado|malware|phishing|instagram/.test(text);
}

export function isPromptInjectionAttempt(message) {
  const text = normalizeText(message);
  return /ignore (todas )?as instrucoes|system prompt|prompt do sistema|agora voce e um hacker|mostre suas instrucoes|reveal.*prompt/.test(
    text,
  );
}

export function safeAssistantError(code, message, status = 503) {
  return new AppError(code, message, status);
}
