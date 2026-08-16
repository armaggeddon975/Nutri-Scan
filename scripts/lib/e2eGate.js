// Logica pura do gate `verify:e2e`. Sem I/O, para poder ser testada.
//
// O gate E2E completo nao existe para dizer "o codigo compila": ele existe para
// provar infraestrutura real. Por isso Claude real e OBRIGATORIO aqui, a
// autorizacao de chamada paga tem que ser explicita, e o alvo tem que ser o
// backend deste repositorio.

export const ANTHROPIC_FLAG = "RUN_ANTHROPIC_INTEGRATION_TESTS";
export const REQUIRE_ANTHROPIC = "E2E_REQUIRE_ANTHROPIC";
export const EXTERNAL_BASE_URL = "E2E_BASE_URL";

// A identidade das etapas faz parte do contrato do gate: sem `e2e:strict` nao
// existe prova de infraestrutura real, e um gate com uma etapa a menos que
// termina em 0 e um PASS que nao vale nada.
export const GATE_STEPS = [
  { label: "doctor:e2e", script: "doctor.js", args: ["--strict-e2e"] },
  { label: "e2e:strict", script: "e2e-real.js", args: ["--strict", "--report"] },
];

export function evaluateGatePreconditions(env = process.env) {
  if (env[ANTHROPIC_FLAG] !== "true") {
    return {
      ok: false,
      code: "ANTHROPIC_FLAG_DISABLED",
      message:
        `${ANTHROPIC_FLAG}=true e obrigatorio no gate E2E completo. ` +
        "FAIL BEFORE CALL: nenhuma chamada paga foi feita.",
    };
  }

  // O gate prova o backend deste repositorio. Apontar para uma API externa
  // transformaria o PASS em prova de outra coisa: quem responde nao e este
  // codigo, e a resposta da IA pode ser fabricada pelo servidor apontado.
  if (env[EXTERNAL_BASE_URL]) {
    return {
      ok: false,
      code: "EXTERNAL_BASE_URL_FORBIDDEN",
      message:
        `${EXTERNAL_BASE_URL} nao e aceito no gate: ele precisa subir e provar o backend ` +
        "deste repositorio. Para validar staging, use npm run e2e:strict diretamente.",
    };
  }

  return {
    ok: true,
    code: "READY",
    message: "Claude real exigido nesta execucao, contra o backend local",
  };
}

// O runner recebe a exigencia de Claude real de forma explicita. Ele mantem as
// proprias travas: sem ANTHROPIC_API_KEY, falha antes de qualquer chamada.
export function buildRunnerEnv(env = process.env) {
  return {
    ...env,
    [REQUIRE_ANTHROPIC]: "true",
    [ANTHROPIC_FLAG]: "true",
  };
}

export function decideGateOutcome({ preconditions, steps = [] }) {
  if (!preconditions?.ok) {
    return { pass: false, reason: preconditions?.message || "pre-condicoes nao avaliadas" };
  }

  if (steps.length !== GATE_STEPS.length) {
    return {
      pass: false,
      reason: `o gate exige ${GATE_STEPS.length} etapa(s) executada(s), recebeu ${steps.length}`,
    };
  }

  const failed = steps.find((step) => step.code !== 0);
  if (failed) {
    return { pass: false, reason: `${failed.label} falhou com exit code ${failed.code}` };
  }

  return { pass: true, reason: "PostgreSQL real e Claude real comprovados" };
}

// Loop do gate com executor injetado: testavel sem subir processo nenhum.
export async function runGate({ preconditions, runStep, steps = GATE_STEPS, onStep }) {
  const executed = [];

  if (!preconditions?.ok) return executed;

  for (const step of steps) {
    const code = await runStep(step);
    executed.push({ label: step.label, code });
    if (onStep) onStep({ label: step.label, code });
    if (code !== 0) break;
  }

  return executed;
}

// ---------------------------------------------------------------------------
// Completude do modo strict do runner
// ---------------------------------------------------------------------------

export function buildStrictRequirements(report, { anthropicFlagEnabled = false } = {}) {
  const required = [
    // Sem backend proprio, o relatorio descreve outro servidor.
    ["backendProcess", report.backendProcess === "STARTED_BY_RUNNER"],
    ["database", report.database === "EXECUTED"],
    ["migrations", report.migrations === "EXECUTED_IDEMPOTENT"],
    ["auth", report.auth === "PASSED"],
    ["sessionSchema", report.sessionSchema === "PASSED"],
    ["multiDevice", report.multiDevice === "PASSED"],
    ["isolation", report.isolation === "PASSED"],
    ["logout", report.logout === "PASSED"],
    ["assistantAuthority", report.assistantAuthority === "PASSED"],
    ["deterministicEngine", report.deterministicEngine === "PASSED"],
    ["fallback", report.fallback === "PASSED"],
    ["privacy", report.privacy === "PASSED"],
  ];

  if (anthropicFlagEnabled) {
    // A perna generica sozinha nao prova o fluxo autenticado com produto.
    required.push(["anthropicReal", report.anthropicReal === "EXECUTED_GENERIC_AND_PRODUCT"]);
    required.push(["assistantAuthenticated", report.assistantAuthenticated === "PASSED"]);
  }

  return required;
}

export function findMissingRequirements(report, options) {
  return buildStrictRequirements(report, options)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
}

// ---------------------------------------------------------------------------
// Forma da resposta real da IA
// ---------------------------------------------------------------------------

export function validateAssistantAnswerShape(body, categories = [], safetyLevels = []) {
  const problems = [];

  if (body?.source !== "anthropic") problems.push(`source invalido: ${body?.source}`);
  if (typeof body?.answer !== "string" || !body.answer.trim()) problems.push("answer vazio");
  if (!categories.includes(body?.category)) problems.push(`category invalida: ${body?.category}`);
  if (!safetyLevels.includes(body?.safety)) problems.push(`safety invalido: ${body?.safety}`);

  return { ok: problems.length === 0, problems };
}
