import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(__dirname, "../..");

// Testes de PRODUCAO sem deploy (v0.7.5).
//
// `env.js` le `NODE_ENV` na importacao, entao modo producao so existe num
// processo novo. Este ajudante sobe um processo filho com o app em producao.
//
// ISOLAMENTO DO `backend/.env` REAL
//
// `env.js` carrega `backend/.env` com `override: false`: variavel que JA existe
// no ambiente nao e sobrescrita. Por isso o filho recebe as DOZE variaveis que o
// backend le, todas explicitamente - inclusive as vazias. Nenhuma fica para o
// `.env` preencher, entao nenhum valor real do arquivo do dono do projeto entra
// no processo de teste. Medido no Windows: variavel vazia sobrevive ao `spawn`
// e o `dotenv` nao a sobrescreve.
//
// O banco aponta para a porta 1 de `127.0.0.1`, que recusa conexao na hora.
// Isso produz um erro REAL do driver `pg` - com host e porta na mensagem - sem
// precisar de banco nenhum. E justamente o tipo de mensagem que nao pode chegar
// ao cliente.
export const BANCO_QUE_RECUSA = "postgresql://usuario_falso:senha_falsa@127.0.0.1:1/banco_inexistente";
export const ORIGEM_DE_PRODUCAO = "https://app.nutriscan.test";

export const VARIAVEIS_LIDAS_PELO_BACKEND = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "DATABASE_SSL",
  "FRONTEND_ORIGIN",
  "TRUST_PROXY",
  "SESSION_TTL_DAYS",
  "SESSION_COOKIE_NAME",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_TIMEOUT_MS",
  "ANTHROPIC_MAX_OUTPUT_TOKENS",
];

export function ambienteDeProducao(sobrescritas = {}) {
  const base = {
    NODE_ENV: "production",
    PORT: "0",
    DATABASE_URL: BANCO_QUE_RECUSA,
    DATABASE_SSL: "false",
    FRONTEND_ORIGIN: ORIGEM_DE_PRODUCAO,
    TRUST_PROXY: "true",
    SESSION_TTL_DAYS: "30",
    SESSION_COOKIE_NAME: "nutriscan_session",
    // Vazia de proposito: o assistente nao entra nestes testes, e uma chave
    // aqui seria uma chave que poderia acabar num log.
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_MODEL: "claude-sonnet-5",
    ANTHROPIC_TIMEOUT_MS: "20000",
    ANTHROPIC_MAX_OUTPUT_TOKENS: "1200",
  };

  const ambiente = { ...base, ...sobrescritas };

  // Garantia de isolamento: toda variavel lida pelo backend esta presente,
  // nem que vazia. Se uma variavel nova for lida no futuro sem entrar aqui, o
  // `.env` real voltaria a vazar para o teste - entao isto quebra.
  for (const nome of VARIAVEIS_LIDAS_PELO_BACKEND) {
    if (!Object.prototype.hasOwnProperty.call(ambiente, nome)) ambiente[nome] = "";
  }

  return {
    ...ambiente,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
  };
}

export async function portaLivre() {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.unref();
    servidor.on("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

export function criarDist() {
  const raiz = mkdtempSync(path.join(os.tmpdir(), "nutriscan-prod-"));
  mkdirSync(path.join(raiz, "assets"), { recursive: true });
  writeFileSync(
    path.join(raiz, "index.html"),
    '<!doctype html><title>NutriScan</title><script type="module" src="/assets/app.js"></script>',
  );
  writeFileSync(path.join(raiz, "assets", "app.js"), "console.log('app');");
  return { raiz, remover: () => rmSync(raiz, { recursive: true, force: true }) };
}

/**
 * Sobe `createApp()` em modo producao, num processo filho, e devolve a URL.
 * A saida de erro do filho e guardada: e nela que o log do servidor aparece.
 */
export async function subirAppDeProducao({ distDir, ambiente = ambienteDeProducao() } = {}) {
  const appUrl = pathToFileURL(path.join(backendRoot, "src/app.js")).href;
  const script = `
    const { createApp } = await import(${JSON.stringify(appUrl)});
    const servidor = createApp({ distDir: ${JSON.stringify(distDir || "")} || undefined })
      .listen(0, "127.0.0.1", () => console.log("PORTA:" + servidor.address().port));
  `;

  const filho = spawn(process.execPath, ["--input-type=module", "-e", script], {
    cwd: backendRoot,
    env: ambiente,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  filho.stderr.on("data", (parte) => {
    stderr += parte.toString();
  });

  const porta = await new Promise((resolve, reject) => {
    let stdout = "";
    const prazo = setTimeout(() => reject(new Error(`o app nao subiu: ${stderr}`)), 20000);
    filho.stdout.on("data", (parte) => {
      stdout += parte.toString();
      const achado = /PORTA:(\d+)/.exec(stdout);
      if (achado) {
        clearTimeout(prazo);
        resolve(Number(achado[1]));
      }
    });
    filho.on("exit", (codigo) => {
      clearTimeout(prazo);
      reject(new Error(`o app saiu com ${codigo} antes de subir: ${stderr}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${porta}`,
    lerStderr: () => stderr,
    encerrar: () =>
      new Promise((resolve) => {
        if (filho.exitCode !== null) return resolve();
        filho.once("exit", () => resolve());
        filho.kill();
      }),
  };
}

/**
 * Roda `node src/server.js` - o ponto de entrada de verdade - e espera ele sair
 * ou abrir a porta. Devolve o que aconteceu.
 */
export async function iniciarServidor(ambiente, { prazoMs = 8000 } = {}) {
  const filho = spawn(process.execPath, ["src/server.js"], {
    cwd: backendRoot,
    env: ambiente,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  filho.stdout.on("data", (parte) => {
    stdout += parte.toString();
  });
  filho.stderr.on("data", (parte) => {
    stderr += parte.toString();
  });

  return new Promise((resolve) => {
    const prazo = setTimeout(() => {
      // Ainda rodando no prazo: o processo SUBIU.
      filho.kill();
      resolve({ subiu: true, codigo: null, stdout, stderr });
    }, prazoMs);

    filho.stdout.on("data", () => {
      if (/ouvindo na porta/.test(stdout)) {
        clearTimeout(prazo);
        filho.kill();
        resolve({ subiu: true, codigo: null, stdout, stderr });
      }
    });

    filho.on("exit", (codigo) => {
      clearTimeout(prazo);
      resolve({ subiu: false, codigo, stdout, stderr });
    });
  });
}
