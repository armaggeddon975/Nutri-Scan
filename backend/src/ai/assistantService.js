import Anthropic from "@anthropic-ai/sdk";

import { env } from "../config/env.js";
import { getUserAllergies } from "../repositories/userRepository.js";
import { buildAssistantContext } from "./contextBuilder.js";
import { getAnthropicClient, hasAnthropicConfig } from "./anthropicClient.js";
import {
  ASSISTANT_OUTPUT_FORMAT,
  ASSISTANT_SYSTEM_PROMPT,
  assistantResponseSchema,
  buildAssistantMessages,
} from "./assistantPrompt.js";
import {
  isOutOfScopeQuestion,
  isPromptInjectionAttempt,
  isUrgentHealthQuestion,
  safeAssistantError,
  validateAssistantChat,
} from "./safety.js";

// Stop reasons que representam uma resposta completa da Messages API.
const COMPLETE_STOP_REASONS = new Set(["end_turn", "stop_sequence"]);

function createLocalResponse(answer, category = "general_food", safety = "normal", usedProductContext = false) {
  return {
    answer,
    category,
    safety,
    usedProductContext,
    source: "local",
  };
}

// Nunca assumir content[0]: a resposta e uma lista de blocos tipados.
export function extractTextContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();
}

export function parseStructuredResponse(response) {
  const stopReason = response?.stop_reason;

  if (stopReason === "refusal") {
    throw safeAssistantError("AI_REFUSAL", "Assistente inteligente recusou responder por seguranca.", 400);
  }

  if (stopReason === "max_tokens") {
    throw safeAssistantError("AI_INCOMPLETE", "Assistente inteligente retornou resposta incompleta.", 502);
  }

  // Fail-closed: resposta sem `stop_reason` nao e tratada como conclusao normal.
  if (!COMPLETE_STOP_REASONS.has(stopReason)) {
    throw safeAssistantError("AI_BAD_RESPONSE", "Assistente inteligente retornou resposta inesperada.", 502);
  }

  const text = extractTextContent(response?.content);
  if (!text) {
    throw safeAssistantError("AI_BAD_RESPONSE", "Assistente inteligente retornou resposta inesperada.", 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw safeAssistantError("AI_BAD_RESPONSE", "Assistente inteligente retornou JSON invalido.", 502);
  }

  const validation = assistantResponseSchema.safeParse(parsed);
  if (!validation.success) {
    throw safeAssistantError("AI_SCHEMA_INVALID", "Assistente inteligente retornou estrutura invalida.", 502);
  }

  return { ...validation.data, source: "anthropic" };
}

// Codigos neutros de provedor: a API publica do NutriScan nao expoe a marca.
//
// ATENCAO: as classes de erro do SDK nao definem `name`. Toda instancia herda
// `name === "Error"`, e um timeout chega com `status` e `code` indefinidos.
// Detectar timeout por nome nunca funciona aqui; so `instanceof` identifica.
// As checagens por status/code abaixo cobrem erros de transporte genericos que
// nao vem do SDK.
export function mapProviderError(error) {
  const status = typeof error?.status === "number" ? error.status : 0;

  if (error instanceof Anthropic.RateLimitError || status === 429) {
    return safeAssistantError("AI_RATE_LIMITED", "Assistente inteligente temporariamente limitado.", 429);
  }

  if (
    error instanceof Anthropic.APIConnectionTimeoutError ||
    error instanceof Anthropic.APIUserAbortError ||
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error?.code === "ETIMEDOUT" ||
    status === 408
  ) {
    return safeAssistantError("AI_TIMEOUT", "Assistente inteligente demorou para responder.", 504);
  }

  if (error instanceof Anthropic.AuthenticationError || status === 401 || status === 403) {
    return safeAssistantError("AI_NOT_CONFIGURED", "Assistente inteligente nao configurado.", 503);
  }

  return safeAssistantError("AI_UNAVAILABLE", "Assistente inteligente temporariamente indisponivel.", 503);
}

// Autoridade do perfil: usuario autenticado usa sempre as alergias oficiais do
// PostgreSQL. `guestAllergies` do request so vale para visitante.
// O loader e injetavel apenas para teste; producao continua usando o repositorio.
export async function buildAssistantProfileAllergies(req, guestAllergies, loadUserAllergies = getUserAllergies) {
  if (req.user?.id) {
    return loadUserAllergies(req.user.id);
  }
  return guestAllergies;
}

export async function answerAssistantChat(req, input, client = getAnthropicClient(), options = {}) {
  const data = validateAssistantChat(input);
  const profileAllergies = await buildAssistantProfileAllergies(
    req,
    data.guestAllergies,
    options.loadUserAllergies,
  );
  const context = buildAssistantContext({
    product: data.product,
    allergies: profileAllergies,
  });

  // Protecoes deterministicas locais. Elas continuam funcionando com ou sem IA.
  if (isUrgentHealthQuestion(data.message)) {
    return createLocalResponse(
      "Se ha falta de ar, inchaco em lingua/garganta/rosto, desmaio ou piora rapida apos alimento, procure atendimento de emergencia agora. Posso ajudar a entender o rotulo depois, mas nesse momento a prioridade e seguranca.",
      "health_caution",
      "urgent",
      Boolean(context.product),
    );
  }

  if (isOutOfScopeQuestion(data.message)) {
    return createLocalResponse(
      "Eu sou focado em alimentacao, rotulos, alergias e interpretacao nutricional. Posso te ajudar com alguma duvida sobre alimento ou produto?",
      "out_of_scope",
      "normal",
      false,
    );
  }

  if (isPromptInjectionAttempt(data.message)) {
    return createLocalResponse(
      "Nao posso revelar instrucoes internas ou mudar meu papel. Posso ajudar com rotulos, ingredientes, alergias e alimentacao.",
      "out_of_scope",
      "caution",
      false,
    );
  }

  if (!client || (!hasAnthropicConfig() && client === getAnthropicClient())) {
    throw safeAssistantError("AI_NOT_CONFIGURED", "Assistente inteligente nao configurado.", 503);
  }

  try {
    const response = await client.messages.create(
      {
        model: env.anthropicModel,
        max_tokens: env.anthropicMaxOutputTokens,
        // Instrucoes privilegiadas ficam no parametro `system`, nunca em `messages`.
        system: ASSISTANT_SYSTEM_PROMPT,
        messages: buildAssistantMessages({
          message: data.message,
          conversation: data.conversation,
          context,
        }),
        // Respostas do assistente sao curtas e estruturadas. Sem thinking, o
        // orcamento de max_tokens fica inteiro para a resposta util.
        thinking: { type: "disabled" },
        output_config: { format: ASSISTANT_OUTPUT_FORMAT },
      },
      { timeout: env.anthropicTimeoutMs },
    );

    return parseStructuredResponse(response);
  } catch (error) {
    if (error?.code?.startsWith?.("AI_")) throw error;
    throw mapProviderError(error);
  }
}
