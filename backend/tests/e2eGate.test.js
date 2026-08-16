import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  ANTHROPIC_FLAG,
  GATE_STEPS,
  REQUIRE_ANTHROPIC,
  buildRunnerEnv,
  buildStrictRequirements,
  decideGateOutcome,
  evaluateGatePreconditions,
  findMissingRequirements,
  runGate,
  validateAssistantAnswerShape,
} from "../../scripts/lib/e2eGate.js";

// Regressao da v0.6.5: o gate `verify:e2e` dependia de
// RUN_OPENAI_INTEGRATION_TESTS, uma flag da arquitetura antiga que ninguem mais
// define. Com ela, o gate podia terminar sem nunca exigir Claude real.

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const scriptsDir = path.join(rootDir, "scripts");

// Ambiente limpo para o processo filho.
//
// Regressao da v0.6.7: apagar a variavel aqui NAO basta. O backend carrega
// backend/.env com `override: false`, entao uma variavel ausente e reposta pelo
// arquivo e o filho enxerga a credencial real. Vazia, a chave existe no
// ambiente, o dotenv nao sobrescreve, e o codigo a trata como nao configurada.
// Sem isso, este teste passava so enquanto backend/.env nao existia.
function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  env.ANTHROPIC_API_KEY = "";
  env.DATABASE_URL = "";
  delete env[ANTHROPIC_FLAG];
  delete env[REQUIRE_ANTHROPIC];
  delete env.E2E_BASE_URL;
  return { ...env, ...overrides };
}

async function runScript(script, args, env) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(scriptsDir, script), ...args], {
      cwd: rootDir,
      env,
    });
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (error) {
    return { code: error.code ?? 1, output: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

// --------------------------------------------------------------------------
// A. Sem RUN_ANTHROPIC_INTEGRATION_TESTS=true, verify:e2e falha
// --------------------------------------------------------------------------

test("A: gate exige a flag de integracao antes de qualquer chamada", () => {
  const semFlag = evaluateGatePreconditions(cleanEnv());
  assert.equal(semFlag.ok, false);
  assert.equal(semFlag.code, "ANTHROPIC_FLAG_DISABLED");
  assert.match(semFlag.message, /FAIL BEFORE CALL/);

  // Flag com valor diferente de "true" tambem nao autoriza.
  for (const valor of ["false", "1", "yes", "TRUE", ""]) {
    assert.equal(evaluateGatePreconditions(cleanEnv({ [ANTHROPIC_FLAG]: valor })).ok, false, `valor ${valor}`);
  }

  assert.equal(evaluateGatePreconditions(cleanEnv({ [ANTHROPIC_FLAG]: "true" })).ok, true);
});

test("A: verify:e2e realmente sai com codigo diferente de zero sem a flag", async () => {
  // Cenario do item 4: mesmo com chave configurada, sem a flag e FAIL.
  const result = await runScript("verify-e2e.js", [], cleanEnv({ ANTHROPIC_API_KEY: "chave-de-teste-nao-usada" }));

  assert.notEqual(result.code, 0, "verify:e2e nao pode retornar 0 sem Claude real exigido");
  assert.match(result.output, /FAIL BEFORE CALL/);
  assert.match(result.output, new RegExp(ANTHROPIC_FLAG));
  // Nenhuma etapa pode ter rodado antes da recusa.
  assert.equal(/\[RUN\] doctor:e2e/.test(result.output), false, "nao pode subir doctor antes de recusar");
});

// --------------------------------------------------------------------------
// B. Flag habilitada sem ANTHROPIC_API_KEY: FAIL BEFORE CALL
// --------------------------------------------------------------------------

test("B: flag habilitada sem ANTHROPIC_API_KEY falha antes da chamada, citando a variavel certa", async () => {
  const result = await runScript(
    "e2e-real.js",
    ["--strict"],
    cleanEnv({ [ANTHROPIC_FLAG]: "true" }),
  );

  assert.notEqual(result.code, 0);
  assert.match(result.output, /FAIL BEFORE CALL/);
  assert.match(result.output, /ANTHROPIC_API_KEY nao esta configurada/);
  // A mensagem nao pode citar a variavel da arquitetura antiga.
  assert.equal(/OPENAI_API_KEY/.test(result.output), false, "mensagem ainda cita OPENAI_API_KEY");
});

test("B: o gate repassa a exigencia de Claude real ao runner", () => {
  const env = buildRunnerEnv(cleanEnv({ [ANTHROPIC_FLAG]: "true" }));
  assert.equal(env[REQUIRE_ANTHROPIC], "true");
  assert.equal(env[ANTHROPIC_FLAG], "true");
});

// --------------------------------------------------------------------------
// C. Nenhuma logica E2E executavel depende de RUN_OPENAI_INTEGRATION_TESTS
// --------------------------------------------------------------------------

test("C: nenhum script executavel depende de RUN_OPENAI_INTEGRATION_TESTS", async () => {
  const libFiles = (await readdir(path.join(scriptsDir, "lib"))).map((file) => path.join("lib", file));
  const scriptFiles = (await readdir(scriptsDir)).filter((file) => file.endsWith(".js"));
  const files = [...scriptFiles, ...libFiles];

  const offenders = [];
  for (const file of files) {
    const source = await readFile(path.join(scriptsDir, file), "utf8");
    if (source.includes("RUN_OPENAI_INTEGRATION_TESTS")) offenders.push(file);
  }

  assert.deepEqual(offenders, [], `scripts ainda citam a flag antiga: ${offenders.join(", ")}`);
});

test("C: o fluxo Anthropic do runner nao cita OPENAI_API_KEY", async () => {
  const source = await readFile(path.join(scriptsDir, "e2e-real.js"), "utf8");
  assert.equal(source.includes("OPENAI_API_KEY"), false);
  assert.equal(source.includes("RUN_ANTHROPIC_INTEGRATION_TESTS"), true);
});

test("C: o secret scan preserva os padroes de chave antiga", async () => {
  // Item 7: padroes do secret scan NAO sao residuo, sao rede de protecao.
  const source = await readFile(path.join(scriptsDir, "verify-release.js"), "utf8");
  assert.equal(source.includes("OPENAI_API_KEY"), true, "padrao de chave OpenAI antiga foi removido do secret scan");
  assert.equal(source.includes("sk-ant-"), true, "padrao de chave Anthropic ausente no secret scan");
});

// --------------------------------------------------------------------------
// D. So PostgreSQL PASS + Claude real PASS + demais gates PASS geram PASS
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
// E. Gate nao aceita alvo externo (achado do gauntlet na v0.6.5)
// --------------------------------------------------------------------------

test("E: E2E_BASE_URL e recusado no gate, que precisa provar o backend local", async () => {
  const recusa = evaluateGatePreconditions(
    cleanEnv({ [ANTHROPIC_FLAG]: "true", E2E_BASE_URL: "https://api-que-eu-controlo.exemplo/api" }),
  );

  assert.equal(recusa.ok, false);
  assert.equal(recusa.code, "EXTERNAL_BASE_URL_FORBIDDEN");
  assert.match(recusa.message, /e2e:strict/);

  // E o comando real recusa de fato, sem subir etapa nenhuma.
  const result = await runScript(
    "verify-e2e.js",
    [],
    cleanEnv({ [ANTHROPIC_FLAG]: "true", E2E_BASE_URL: "https://api-que-eu-controlo.exemplo/api" }),
  );

  assert.notEqual(result.code, 0);
  assert.match(result.output, /E2E_BASE_URL/);
  assert.equal(/\[RUN\] doctor:e2e/.test(result.output), false);
});

test("E: strict exige que o backend tenha sido iniciado pelo proprio runner", () => {
  const reportCompleto = {
    backendProcess: "STARTED_BY_RUNNER",
    database: "EXECUTED",
    migrations: "EXECUTED_IDEMPOTENT",
    auth: "PASSED",
    sessionSchema: "PASSED",
    multiDevice: "PASSED",
    isolation: "PASSED",
    logout: "PASSED",
    assistantAuthority: "PASSED",
    deterministicEngine: "PASSED",
    fallback: "PASSED",
    privacy: "PASSED",
    anthropicReal: "EXECUTED_GENERIC_AND_PRODUCT",
    assistantAuthenticated: "PASSED",
  };

  assert.deepEqual(findMissingRequirements(reportCompleto, { anthropicFlagEnabled: true }), []);

  // API externa nao satisfaz o modo strict.
  assert.deepEqual(
    findMissingRequirements({ ...reportCompleto, backendProcess: "EXTERNAL" }, { anthropicFlagEnabled: true }),
    ["backendProcess"],
  );

  // A perna generica sozinha nao prova o fluxo autenticado com produto.
  assert.deepEqual(
    findMissingRequirements({ ...reportCompleto, anthropicReal: "EXECUTED_GENERIC" }, { anthropicFlagEnabled: true }),
    ["anthropicReal"],
  );

  // Com a flag ligada, Claude real e obrigatorio.
  assert.deepEqual(
    findMissingRequirements({ ...reportCompleto, anthropicReal: "NOT_EXECUTED" }, { anthropicFlagEnabled: true }),
    ["anthropicReal"],
  );

  // A lista de requisitos nunca pode ficar vazia: isso seria strict sem prova.
  assert.ok(buildStrictRequirements(reportCompleto, { anthropicFlagEnabled: true }).length >= 14);
});

test("E: resposta fabricada da IA nao passa na validacao de forma", () => {
  const categorias = ["nutrition", "allergy"];
  const seguranca = ["normal", "caution"];
  const valida = { source: "anthropic", answer: "resposta util", category: "allergy", safety: "caution" };

  assert.equal(validateAssistantAnswerShape(valida, categorias, seguranca).ok, true);

  for (const [nome, body] of [
    ["source local", { ...valida, source: "local" }],
    ["source ausente", { ...valida, source: undefined }],
    ["answer vazio", { ...valida, answer: "   " }],
    ["category invalida", { ...valida, category: "inventada" }],
    ["safety invalido", { ...valida, safety: "tranquilo" }],
    ["corpo vazio", {}],
  ]) {
    const resultado = validateAssistantAnswerShape(body, categorias, seguranca);
    assert.equal(resultado.ok, false, nome);
    assert.ok(resultado.problems.length > 0, nome);
  }
});

// --------------------------------------------------------------------------
// F. Identidade e execucao das etapas do gate
// --------------------------------------------------------------------------

test("F: o gate mantem exatamente doctor:e2e e e2e:strict, nessa ordem", () => {
  assert.deepEqual(
    GATE_STEPS.map((step) => step.label),
    ["doctor:e2e", "e2e:strict"],
  );
  assert.deepEqual(GATE_STEPS.map((step) => step.script), ["doctor.js", "e2e-real.js"]);
  assert.ok(GATE_STEPS[1].args.includes("--strict"), "a etapa de E2E precisa rodar em modo strict");
});

test("F: runGate para na primeira falha e nao inventa etapa executada", async () => {
  const autorizado = { ok: true, code: "READY", message: "ok" };

  const todas = await runGate({ preconditions: autorizado, runStep: async () => 0 });
  assert.deepEqual(todas, [
    { label: "doctor:e2e", code: 0 },
    { label: "e2e:strict", code: 0 },
  ]);
  assert.equal(decideGateOutcome({ preconditions: autorizado, steps: todas }).pass, true);

  // Falha na primeira etapa nao executa a segunda, e o codigo real e gravado.
  const parcial = await runGate({ preconditions: autorizado, runStep: async () => 1 });
  assert.deepEqual(parcial, [{ label: "doctor:e2e", code: 1 }]);
  assert.equal(decideGateOutcome({ preconditions: autorizado, steps: parcial }).pass, false);

  // Cenario critico: primeira etapa passa, a segunda falha. Se o codigo real da
  // etapa nao for gravado, o gate contaria duas etapas "ok" e viraria PASS.
  let chamada = 0;
  const segundaFalha = await runGate({
    preconditions: autorizado,
    runStep: async () => (++chamada === 1 ? 0 : 1),
  });
  assert.deepEqual(segundaFalha, [
    { label: "doctor:e2e", code: 0 },
    { label: "e2e:strict", code: 1 },
  ]);
  const resultado = decideGateOutcome({ preconditions: autorizado, steps: segundaFalha });
  assert.equal(resultado.pass, false);
  assert.match(resultado.reason, /e2e:strict/);

  // Pre-condicao recusada nao executa nada.
  const nenhuma = await runGate({ preconditions: { ok: false, message: "recusado" }, runStep: async () => 0 });
  assert.deepEqual(nenhuma, []);

  // Etapa que nunca roda nao pode virar PASS: contagem faz parte do contrato.
  assert.equal(
    decideGateOutcome({ preconditions: autorizado, steps: [{ label: "doctor:e2e", code: 0 }] }).pass,
    false,
  );
});

test("F: o executor recebe o ambiente com Claude real exigido", async () => {
  const autorizado = { ok: true, code: "READY", message: "ok" };
  const env = buildRunnerEnv(cleanEnv({ [ANTHROPIC_FLAG]: "true" }));
  const vistos = [];

  await runGate({
    preconditions: autorizado,
    runStep: async (step) => {
      vistos.push({ step: step.label, requer: env[REQUIRE_ANTHROPIC], flag: env[ANTHROPIC_FLAG] });
      return 0;
    },
  });

  assert.equal(vistos.length, 2);
  for (const visto of vistos) {
    assert.equal(visto.requer, "true", `${visto.step} sem E2E_REQUIRE_ANTHROPIC`);
    assert.equal(visto.flag, "true", `${visto.step} sem ${ANTHROPIC_FLAG}`);
  }
});

test("D: PASS exige pre-condicao autorizada e todas as etapas em exit 0", () => {
  const autorizado = { ok: true, code: "READY", message: "Claude real exigido nesta execucao" };
  const recusado = evaluateGatePreconditions(cleanEnv());

  const todasOk = [
    { label: "doctor:e2e", code: 0 },
    { label: "e2e:strict", code: 0 },
  ];

  assert.equal(decideGateOutcome({ preconditions: autorizado, steps: todasOk }).pass, true);

  // Qualquer etapa falhando derruba o gate.
  assert.equal(
    decideGateOutcome({
      preconditions: autorizado,
      steps: [{ label: "doctor:e2e", code: 1 }, { label: "e2e:strict", code: 0 }],
    }).pass,
    false,
  );
  assert.equal(
    decideGateOutcome({
      preconditions: autorizado,
      steps: [{ label: "doctor:e2e", code: 0 }, { label: "e2e:strict", code: 1 }],
    }).pass,
    false,
  );

  // Sem etapa nenhuma nao existe prova.
  assert.equal(decideGateOutcome({ preconditions: autorizado, steps: [] }).pass, false);

  // Pre-condicao recusada nunca vira PASS, mesmo com tudo verde depois.
  assert.equal(decideGateOutcome({ preconditions: recusado, steps: todasOk }).pass, false);
  assert.match(decideGateOutcome({ preconditions: recusado, steps: todasOk }).reason, /FAIL BEFORE CALL/);
});
