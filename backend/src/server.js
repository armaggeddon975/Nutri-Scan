import { createApp } from "./app.js";
import {
  descreverProblemasDeAmbiente,
  env,
  isProduction,
  verificarAmbienteDeProducao,
  verificarModo,
} from "./config/env.js";

// Em producao, a configuracao e conferida ANTES de abrir a porta (v0.7.5).
//
// Faltando variavel obrigatoria, o processo sai com codigo 1 e diz qual falta.
// Nao abre a porta, nao toca o banco, nao chama a Anthropic: nada roda com
// configuracao incompleta. Na hospedagem isso aparece como deploy que nao subiu
// - visivel no painel e no health check - em vez de um servico no ar
// funcionando pela metade.
//
// `process.exitCode` em vez de `process.exit()`: encerrar a forca enquanto o
// stderr ainda escreve pode cortar a mensagem que explica o problema.
function iniciar() {
  // Primeiro o modo: com NODE_ENV digitado errado, `isProduction()` responde
  // false e a conferencia de producao abaixo nem rodaria.
  const modo = verificarModo(process.env);
  if (modo.length > 0) {
    console.error(descreverProblemasDeAmbiente(modo, "NODE_ENV nao reconhecido."));
    process.exitCode = 1;
    return;
  }

  if (isProduction()) {
    const problemas = verificarAmbienteDeProducao(process.env);
    if (problemas.length > 0) {
      console.error(descreverProblemasDeAmbiente(problemas));
      process.exitCode = 1;
      return;
    }
  }

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`NutriScan API v${env.version} ouvindo na porta ${env.port}`);
  });
}

iniciar();
