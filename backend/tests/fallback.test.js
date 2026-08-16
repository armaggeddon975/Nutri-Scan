import assert from "node:assert/strict";
import test from "node:test";

import { answerAssistantChat, buildAssistantProfileAllergies } from "../src/ai/assistantService.js";
import {
  ASSISTANT_REFUSAL_TEXT,
  decideAssistantFallback,
  resolveAssistantSuccess,
} from "../../src/services/assistantFallback.js";
import { buildAssistantAnswer } from "../../src/services/assistantService.js";
import { scanAllergies } from "../../src/utils/allergens.js";

const E2E_PRODUCT = {
  name: "Chocolate E2E",
  ingredients_text: "leite integral, açúcar, cacau",
};

function captureMockClient(calls) {
  return {
    messages: {
      create: async (payload) => {
        calls.push(payload);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({
            answer: "Resposta de teste.",
            category: "allergy",
            safety: "caution",
            usedProductContext: true,
          }) }],
        };
      },
    },
  };
}

function snapshotFromCall(payload) {
  return JSON.parse(payload.messages[payload.messages.length - 1].content[0].text).context.allergySnapshot;
}

test("AI_NOT_CONFIGURED cai para resposta local do motor de regras", () => {
  const decision = decideAssistantFallback({ code: "AI_NOT_CONFIGURED" });

  assert.equal(decision.source, "local");
  assert.equal(decision.strategy, "local_answer");
  assert.equal(decision.connection.type, "warning");

  const answer = buildAssistantAnswer(
    E2E_PRODUCT,
    "Posso consumir esse produto?",
    scanAllergies(E2E_PRODUCT, ["milk"]),
  );

  assert.equal(typeof answer, "string");
  assert.ok(answer.trim().length > 0);
});

test("demais falhas da IA tambem produzem resposta local", () => {
  for (const code of ["AI_UNAVAILABLE", "AI_TIMEOUT", "AI_RATE_LIMITED", "NETWORK_ERROR", undefined]) {
    const decision = decideAssistantFallback(code ? { code } : undefined);
    assert.equal(decision.source, "local", `codigo ${code}`);
    assert.equal(decision.strategy, "local_answer", `codigo ${code}`);
  }
});

test("AI_REFUSAL usa texto fixo de recusa, nao o motor local", () => {
  const decision = decideAssistantFallback({ code: "AI_REFUSAL" });

  assert.equal(decision.source, "local");
  assert.equal(decision.strategy, "refusal");
  assert.equal(decision.text, ASSISTANT_REFUSAL_TEXT);
  assert.equal(decision.connection.type, "warning");
});

test("resposta da IA preserva a origem exibida na interface", () => {
  assert.deepEqual(resolveAssistantSuccess({ source: "anthropic", answer: "ok" }).connection, {
    type: "success",
    message: "Nutri IA respondeu.",
  });
  assert.equal(resolveAssistantSuccess({ source: "local", answer: "ok" }).source, "local");
  assert.equal(resolveAssistantSuccess({ answer: "ok" }).source, "ai");
});

test("perfil autenticado do PostgreSQL vence guestAllergies do request", async () => {
  const calls = [];
  const loadUserAllergies = async (userId) => {
    assert.equal(userId, "user-e2e");
    return ["milk"];
  };

  const result = await answerAssistantChat(
    { user: { id: "user-e2e" } },
    {
      message: "Posso consumir esse produto?",
      conversation: [],
      product: E2E_PRODUCT,
      guestAllergies: ["soy"],
    },
    captureMockClient(calls),
    { loadUserAllergies },
  );

  const snapshot = snapshotFromCall(calls[0]);

  assert.equal(result.source, "anthropic");
  assert.deepEqual(snapshot.profileAllergies, ["milk"]);
  assert.equal(snapshot.profileAllergies.includes("soy"), false);
  assert.equal(snapshot.hasDeclaredConflict, true);
  assert.deepEqual(snapshot.detectedConflicts, ["milk"]);
});

test("visitante continua usando guestAllergies do request", async () => {
  const calls = [];

  await answerAssistantChat(
    { user: null },
    {
      message: "Posso consumir esse produto?",
      conversation: [],
      product: E2E_PRODUCT,
      guestAllergies: ["soy"],
    },
    captureMockClient(calls),
  );

  const snapshot = snapshotFromCall(calls[0]);
  assert.deepEqual(snapshot.profileAllergies, ["soy"]);
  assert.deepEqual(snapshot.detectedConflicts, []);
});

test("loader de alergias so e consultado para usuario autenticado", async () => {
  let calledWith = null;
  const loader = async (userId) => {
    calledWith = userId;
    return ["peanut"];
  };

  assert.deepEqual(await buildAssistantProfileAllergies({ user: null }, ["soy"], loader), ["soy"]);
  assert.equal(calledWith, null);

  assert.deepEqual(await buildAssistantProfileAllergies({ user: { id: "abc" } }, ["soy"], loader), [
    "peanut",
  ]);
  assert.equal(calledWith, "abc");
});
