import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// O `backend/.env` REAL nunca e tocado por este arquivo.
//
// Ate a v0.7.6 estes testes escreviam o `.env` de teste por cima do real e o
// restauravam no `finally`. Um processo morto no meio - Ctrl+C, timeout, queda
// de energia - deixava o arquivo temporario no lugar, e a configuracao real
// (string do banco, chave da IA) se perdia. Enquanto o teste rodava, qualquer
// outro processo que lesse o `.env` recebia os valores falsos.
//
// Agora cada teste monta um backend minimo numa pasta temporaria: a MESMA
// `src/config/env.js`, copiada na hora, o `package.json` de onde ela le a
// versao, o pacote `dotenv` e um `.env` proprio. O processo de prova roda com
// cwd em OUTRA pasta, o que prova a leitura por caminho absoluto melhor do que
// antes - antes o cwd era o proprio backend.
const ENV_REAL = path.join(backendRoot, ".env");
const assinaturaDoEnvReal = () => {
  if (!existsSync(ENV_REAL)) return null;
  const { mtimeMs, size } = statSync(ENV_REAL); // so metadados: o conteudo nao e lido
  return { mtimeMs, size };
};
const ENV_REAL_ANTES = assinaturaDoEnvReal();

function criarBackendIsolado(conteudoDoEnv) {
  const raiz = mkdtempSync(path.join(os.tmpdir(), "nutriscan-env-"));
  const backend = path.join(raiz, "backend");
  mkdirSync(path.join(backend, "src/config"), { recursive: true });
  cpSync(path.join(backendRoot, "src/config/env.js"), path.join(backend, "src/config/env.js"));
  cpSync(path.join(backendRoot, "package.json"), path.join(backend, "package.json"));
  // Copia, e nao link: apagar uma pasta com link dentro pode seguir o link.
  cpSync(path.join(backendRoot, "node_modules/dotenv"), path.join(backend, "node_modules/dotenv"), {
    recursive: true,
  });
  writeFileSync(path.join(backend, ".env"), conteudoDoEnv, "utf8");
  const cwdAlheio = path.join(raiz, "outro-lugar");
  mkdirSync(cwdAlheio);

  return {
    envModuleUrl: pathToFileURL(path.join(backend, "src/config/env.js")).href,
    cwdAlheio,
    remover: () => rmSync(raiz, { recursive: true, force: true }),
  };
}

// A versao esperada vem do manifesto, e nao de um literal escrito aqui.
//
// Ate a v0.7.1 este teste e `http.test.js` traziam "0.7.0" escrito na mao.
// Como o numero real mora em `src/config/env.js`, cada incremento de versao
// quebrava dois testes que nao tem nada a ver com versao, em arquivos que
// nenhuma documentacao listava entre os pontos a atualizar. Quem estivesse com
// pressa consertaria trocando o literal, que e o mesmo gesto de mudar um teste
// para ele passar - so que aqui parecia legitimo.
//
// `version.test.js` continua sendo quem prova que o manifesto, o env e a
// documentacao concordam. Este teste so precisa da versao correta para
// verificar o que ele de fato testa: que o `.env` e lido do caminho absoluto.
const VERSAO_ESPERADA = JSON.parse(
  await readFile(path.join(backendRoot, "package.json"), "utf8"),
).version;

function runEnvProbe({ envModuleUrl, cwdAlheio }, extraEnv = {}) {
  const script = `
    const { env } = await import(${JSON.stringify(`${envModuleUrl}?t=${Date.now()}-${Math.random()}`)});
    console.log(JSON.stringify({
      nodeEnv: env.nodeEnv,
      port: env.port,
      databaseUrl: env.databaseUrl,
      databaseSsl: env.databaseSsl,
      sessionTtlDays: env.sessionTtlDays,
      version: env.version,
      anthropicModel: env.anthropicModel,
      anthropicTimeoutMs: env.anthropicTimeoutMs,
      anthropicMaxOutputTokens: env.anthropicMaxOutputTokens
    }));
  `;

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: cwdAlheio,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...extraEnv,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

async function withTemporaryEnv(content, callback) {
  const isolado = criarBackendIsolado(content);
  try {
    return await callback(isolado);
  } finally {
    isolado.remover();
  }
}

test("carrega backend/.env por caminho absoluto e valida valores", async () => {
  await withTemporaryEnv(
    [
      "NODE_ENV=test",
      "PORT=4312",
      "DATABASE_URL=postgresql://env-file.example/nutriscan",
      "DATABASE_SSL=true",
      "SESSION_TTL_DAYS=12",
      "ANTHROPIC_MODEL=claude-modelo-de-teste",
      "ANTHROPIC_TIMEOUT_MS=1234",
      "ANTHROPIC_MAX_OUTPUT_TOKENS=567",
      "",
    ].join("\n"),
    async (isolado) => {
      const env = runEnvProbe(isolado);
      assert.equal(env.nodeEnv, "test");
      assert.equal(env.port, 4312);
      assert.equal(env.databaseUrl, "postgresql://env-file.example/nutriscan");
      assert.equal(env.databaseSsl, true);
      assert.equal(env.sessionTtlDays, 12);
      assert.equal(env.version, VERSAO_ESPERADA);
      assert.equal(env.anthropicModel, "claude-modelo-de-teste");
      assert.equal(env.anthropicTimeoutMs, 1234);
      assert.equal(env.anthropicMaxOutputTokens, 567);
    },
  );
});

test("variaveis do sistema prevalecem sobre backend/.env", async () => {
  await withTemporaryEnv("PORT=4312\nDATABASE_SSL=false\nSESSION_TTL_DAYS=12\n", async (isolado) => {
    const env = runEnvProbe(isolado, {
      PORT: "4999",
      DATABASE_SSL: "true",
      SESSION_TTL_DAYS: "22",
    });

    assert.equal(env.port, 4999);
    assert.equal(env.databaseSsl, true);
    assert.equal(env.sessionTtlDays, 22);
  });
});

test("valores invalidos de ambiente caem em defaults seguros", async () => {
  await withTemporaryEnv(
    "NODE_ENV=staging\nPORT=abc\nDATABASE_SSL=talvez\nSESSION_TTL_DAYS=0\nANTHROPIC_TIMEOUT_MS=abc\nANTHROPIC_MAX_OUTPUT_TOKENS=-1\n",
    async (isolado) => {
      const env = runEnvProbe(isolado);
      // LER o ambiente com NODE_ENV desconhecido continua dando development.
      // SUBIR com ele, nao: `server.js` confere `verificarModo` antes de abrir a
      // porta e recusa - ver o teste "MODO" em productionHardening.test.js.
      assert.equal(env.nodeEnv, "development");
      assert.equal(env.port, 3000);
      assert.equal(env.databaseSsl, false);
      assert.equal(env.sessionTtlDays, 30);
      assert.equal(env.anthropicTimeoutMs, 20000);
      assert.equal(env.anthropicMaxOutputTokens, 1200);
    },
  );
});

test("o backend/.env real nao foi tocado por estes testes", () => {
  // Fica por ultimo de proposito: os testes de um arquivo rodam em ordem. So
  // metadados - data de modificacao e tamanho -, nunca o conteudo.
  assert.deepEqual(assinaturaDoEnvReal(), ENV_REAL_ANTES, "um teste de ambiente alterou o backend/.env real");
});

test("o .env de teste nunca e escrito no caminho do backend real", async () => {
  // A guarda acima so pega a escrita se ela ficar. Esta pega pela fonte: nenhuma
  // escrita deste arquivo pode mirar o `.env` real.
  const fonte = await readFile(fileURLToPath(import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /writeFileSync\(\s*ENV_REAL/, "o teste voltou a escrever no .env real");
  assert.doesNotMatch(fonte, /writeFile\(\s*envPath/, "o teste voltou a escrever no .env real");
});
