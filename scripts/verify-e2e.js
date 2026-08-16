import { spawn } from "node:child_process";
import path from "node:path";

import { rootDir, statusLine } from "./common.js";
import {
  ANTHROPIC_FLAG,
  buildRunnerEnv,
  decideGateOutcome,
  evaluateGatePreconditions,
  runGate,
} from "./lib/e2eGate.js";

// GATE de infraestrutura real.
//
// Diferente de `verify:release` (build/test/audit/secret), este comando exige
// servico real de ponta a ponta e NUNCA retorna PASS sem Claude real:
//
//   doctor:e2e  -> dependencias, DATABASE_URL, PostgreSQL, migrations,
//                  ANTHROPIC_API_KEY e ANTHROPIC_MODEL
//   e2e:strict  -> fluxo completo com PostgreSQL e Claude real
//
// A chamada paga so acontece com autorizacao explicita. Sem
// RUN_ANTHROPIC_INTEGRATION_TESTS=true, o gate falha antes de qualquer chamada.

function runNodeScript(script, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(rootDir, "scripts", script), ...args], {
      cwd: rootDir,
      stdio: "inherit",
      env,
      shell: false,
      windowsHide: true,
    });
    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  // FAIL BEFORE CALL: avaliado antes de subir qualquer processo.
  const preconditions = evaluateGatePreconditions(process.env);

  if (!preconditions.ok) {
    console.error(statusLine("FAIL", "verify:e2e", preconditions.message));
    console.error(
      statusLine("INFO", "como habilitar", `${ANTHROPIC_FLAG}=true npm run verify:e2e`),
    );
    process.exitCode = 1;
    return;
  }

  console.log(statusLine("OK", "pre-requisito", preconditions.message));

  const runnerEnv = buildRunnerEnv(process.env);

  const executed = await runGate({
    preconditions,
    runStep: (step) => {
      console.log(statusLine("RUN", step.label));
      return runNodeScript(step.script, step.args, runnerEnv);
    },
    onStep: ({ label, code }) => {
      if (code === 0) console.log(statusLine("OK", label));
      else console.error(statusLine("FAIL", label, `exit code ${code}`));
    },
  });

  const outcome = decideGateOutcome({ preconditions, steps: executed });

  if (!outcome.pass) {
    console.error(statusLine("FAIL", "verify:e2e", outcome.reason));
    process.exitCode = 1;
    return;
  }

  console.log(statusLine("PASS", "verify:e2e", outcome.reason));
}

main().catch((error) => {
  console.error(statusLine("FAIL", "verify:e2e", error.message));
  process.exitCode = 1;
});
