import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { rootDir, statusLine } from "./common.js";
import {
  carregarConjunto,
  carregarRegistro,
  conferirRegistro,
  descreverProblema,
  formatarRelatorio,
  medir,
  MODOS,
} from "./lib/medicaoDoMotor.js";

// npm run medir:motor
//
// Mede o motor de alergenicos contra o conjunto de produtos reais guardado em
// `medicao/conjunto-off.json` e imprime o relatorio. Roda sem rede.
//
//   --conferir   compara com `medicao/resultado-registrado.json` e sai com
//                codigo 1 se um erro passar do registrado, se aparecer um caso
//                novo ou se um caso registrado deixar de acontecer. E o que o
//                `verify:release` roda.
//   --json       imprime o resultado bruto em JSON, no lugar do relatorio.

function hashDoMotor() {
  const fonte = readFileSync(path.join(rootDir, "shared", "allergenEngine.js"), "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(fonte).digest("hex");
}

function main() {
  const conjunto = carregarConjunto();
  const resultados = [medir(conjunto, { modo: MODOS.PIPELINE }), medir(conjunto, { modo: MODOS.SO_TEXTO })];

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ motorSha256: hashDoMotor(), resultados }, null, 2));
  } else {
    console.log(formatarRelatorio(conjunto, resultados, { motorSha256: hashDoMotor() }));
  }

  if (!process.argv.includes("--conferir")) return;
  const registro = carregarRegistro();
  const problemas = resultados.flatMap((resultado) => conferirRegistro(resultado, registro[resultado.modo]));
  console.log("");
  if (problemas.length) {
    for (const problema of problemas) console.error(statusLine("FAIL", "medicao do motor", descreverProblema(problema)));
    process.exitCode = 1;
    return;
  }
  const graves = resultados.map((r) => `${r.modo}: ${r.total.falsoNegativo} FN + ${r.total.declaradoComoTraco} declarado->traco`).join("; ");
  console.log(statusLine("OK", "medicao do motor", `igual ao registrado (${graves})`));
}

try {
  main();
} catch (erro) {
  console.error(statusLine("FAIL", "medicao do motor", erro.message));
  process.exitCode = 1;
}
