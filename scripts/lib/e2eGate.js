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

    // v0.7.0 - historico, favoritos e sincronizacao.
    //
    // Sao requisitos BASE, e nao condicionais a flag da Anthropic: eles
    // dependem apenas de PostgreSQL real. Amarra-los a IA deixaria o gate
    // aprovar uma execucao sem banco que nunca exercitou sincronizacao.
    //
    // Cada um cobre uma promessa diferente, e por isso sao tres e nao um:
    // gravar em A e ler em B (historico), o mesmo para favoritos, e o veredito
    // continuar sendo recalculado depois de o perfil mudar.
    ["historySync", report.historySync === "PASSED"],
    ["favoritesSync", report.favoritesSync === "PASSED"],
    ["verdictFreshness", report.verdictFreshness === "PASSED"],

    // v0.7.3 - consulta por codigo digitado.
    //
    // Requisito BASE, como os tres acima: ele nao depende de IA, so do
    // caminho de produto e do motor deterministico. Amarra-lo a flag da
    // Anthropic deixaria o gate aprovar uma execucao que nunca exercitou a
    // entrada manual.
    //
    // Ele existe por um motivo que vai alem da funcionalidade nova: ate a
    // v0.7.2, o caminho principal do produto - o que decide qual alimento a
    // pessoa esta vendo - nunca tinha sido executado por gate nenhum. A
    // camera nao roda no ambiente de execucao, e a consulta vivia dentro de
    // um componente React. Este subgate e a primeira vez que esse caminho e
    // exercitado de ponta a ponta.
    ["manualCodeLookup", report.manualCodeLookup === "PASSED"],

    // v0.8.0 - direitos do titular.
    //
    // Requisitos BASE, nao condicionais a flag da Anthropic: as duas rotas
    // dependem so de PostgreSQL real, e nenhuma fala com a IA. Amarra-los a
    // flag deixaria o gate aprovar uma execucao sem IA que nunca exportou nem
    // excluiu nada.
    //
    // Sao dois, e nao um "conta": exportar e excluir sao promessas
    // diferentes. Um so esconderia qual das duas quebrou.
    ["accountExport", report.accountExport === "PASSED"],
    ["accountDeletion", report.accountDeletion === "PASSED"],

    // v0.9.0 - nivel de alerta por alergia. Requisito BASE: depende so do
    // PostgreSQL e do motor deterministico. O modelo do subgate e simulado de
    // proposito, para forcar a negacao do conflito; amarrar o requisito a flag
    // da Anthropic deixaria o gate aprovar sem nunca ter provado o piso.
    ["severityVerdict", report.severityVerdict === "PASSED"],

    // v0.10.0 - comparacao de dois produtos. Requisito BASE: depende do
    // PostgreSQL e do motor; o modelo do subgate e simulado, para forcar a troca
    // das explicacoes e a negacao do conflito.
    ["productComparison", report.productComparison === "PASSED"],

    // v0.11.0 - o cache para usar sem rede. Requisito BASE: depende do
    // PostgreSQL e dos modulos do cliente; nao chama IA. O que ele prova e o
    // que nao prova esta no subgate, em `e2e-real.js`.
    ["offlineCache", report.offlineCache === "PASSED"],
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
