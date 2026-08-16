import Anthropic from "@anthropic-ai/sdk";

import { env } from "../config/env.js";

// A chave Anthropic vive exclusivamente aqui, no backend.
// O frontend nunca recebe nem armazena credencial de IA.

let client = null;

export function hasAnthropicConfig() {
  return Boolean(env.anthropicApiKey);
}

export function getAnthropicClient() {
  if (!hasAnthropicConfig()) return null;

  if (!client) {
    client = new Anthropic({
      apiKey: env.anthropicApiKey,
      // No SDK TypeScript/Node o timeout e em milissegundos.
      timeout: env.anthropicTimeoutMs,
      maxRetries: 1,
    });
  }

  return client;
}

export function resetAnthropicClient() {
  client = null;
}
