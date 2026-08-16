// Decisao pura de fallback do Nutri Assistente.
// Extraida do componente para poder ser testada sem React:
// dado o erro da API, decide se a resposta vira do texto de recusa
// ou do motor local `buildAssistantAnswer`.

export const ASSISTANT_REFUSAL_TEXT =
  "Nao consigo responder essa solicitacao com seguranca. Posso ajudar com duvidas sobre rotulos, ingredientes, alergias e nutricao dentro dos limites do app.";

export const ASSISTANT_STATUS = {
  ai: { type: "success", message: "Nutri IA respondeu." },
  local: { type: "success", message: "Resposta local utilizada." },
  refusal: { type: "warning", message: "A IA recusou a resposta por seguranca." },
  fallback: {
    type: "warning",
    message: "Modo inteligente temporariamente indisponivel. Resposta local utilizada.",
  },
};

// A interface nao conhece o provedor de IA. Qualquer origem diferente de
// "local" e tratada como resposta do Nutri Assistente via backend.
export function resolveAssistantSuccess(result) {
  const isLocal = result?.source === "local";
  return {
    source: isLocal ? "local" : result?.source || "ai",
    strategy: "remote_answer",
    text: result?.answer || "",
    connection: isLocal ? ASSISTANT_STATUS.local : ASSISTANT_STATUS.ai,
  };
}

export function decideAssistantFallback(error) {
  if (error?.code === "AI_REFUSAL") {
    return {
      source: "local",
      strategy: "refusal",
      text: ASSISTANT_REFUSAL_TEXT,
      connection: ASSISTANT_STATUS.refusal,
    };
  }

  // AI_NOT_CONFIGURED, AI_UNAVAILABLE, AI_TIMEOUT, AI_RATE_LIMITED, rede, etc.
  return {
    source: "local",
    strategy: "local_answer",
    text: "",
    connection: ASSISTANT_STATUS.fallback,
  };
}
