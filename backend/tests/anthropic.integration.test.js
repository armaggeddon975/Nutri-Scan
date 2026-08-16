import assert from "node:assert/strict";
import test from "node:test";

import { answerAssistantChat } from "../src/ai/assistantService.js";
import { getAnthropicClient, hasAnthropicConfig } from "../src/ai/anthropicClient.js";
import { ASSISTANT_CATEGORIES, ASSISTANT_SAFETY_LEVELS } from "../src/ai/assistantPrompt.js";
import { env } from "../src/config/env.js";

const shouldRun =
  process.env.RUN_ANTHROPIC_INTEGRATION_TESTS === "true" && Boolean(env.anthropicApiKey);

test("cliente Anthropic so existe quando a chave esta configurada", () => {
  assert.equal(hasAnthropicConfig(), Boolean(env.anthropicApiKey));
  if (!env.anthropicApiKey) {
    assert.equal(getAnthropicClient(), null);
  } else {
    assert.ok(getAnthropicClient());
  }
});

test(
  "Claude real responde pergunta curta quando explicitamente habilitado",
  {
    skip: shouldRun
      ? false
      : "NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY",
  },
  async () => {
    const result = await answerAssistantChat(
      { user: null },
      {
        message: "Em uma frase, explique o que e proteina.",
        conversation: [],
        product: null,
        guestAllergies: [],
      },
    );

    assert.equal(result.source, "anthropic");
    assert.equal(typeof result.answer, "string");
    assert.ok(result.answer.length > 10);
    assert.ok(ASSISTANT_CATEGORIES.includes(result.category));
    assert.ok(ASSISTANT_SAFETY_LEVELS.includes(result.safety));
  },
);
