import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

import { npmCommand, rootDir } from "./common.js";

// PostgreSQL embutido para desenvolvimento.
//
// Existe para quem nao tem Docker nem permissao de administrador na maquina
// (caso real: notebook corporativo). O pacote `embedded-postgres` traz os
// binarios oficiais do PostgreSQL 17 e roda tudo como usuario comum, com os
// dados em `.pgdata/` na raiz do projeto (ignorado pelo Git).
//
// Nao substitui o Docker em quem o tem (`npm run db:up` continua valendo) e
// nao serve para producao: la o banco e o Neon, ver `render.yaml`.
//
// Porta 5433, e nao a 5432 padrao, para nao brigar com um PostgreSQL que ja
// exista instalado no sistema.

// O `initdb` do PostgreSQL rejeita caminho de dados com byte nao-UTF8. No
// Windows em portugues a area de trabalho se chama "Área de Trabalho", e o
// acento faz o initdb abortar com:
//
//   FATAL: invalid byte sequence for encoding "UTF8": 0xc1 0x72
//
// Por isso o diretorio e configuravel: quem tiver o projeto sob um caminho com
// acento aponta `DEV_DB_DATA_DIR` para um lugar sem acento, por exemplo
// `%LOCALAPPDATA%\nutriscan-pgdata`. O padrao continua sendo `.pgdata/` na
// raiz, que funciona na maioria das maquinas e ja esta no .gitignore.
const DATA_DIR = process.env.DEV_DB_DATA_DIR
  ? path.resolve(process.env.DEV_DB_DATA_DIR)
  : path.join(rootDir, ".pgdata");
const PORT = Number.parseInt(process.env.DEV_DB_PORT || "5433", 10);
const USER = "nutriscan";
const PASSWORD = "nutriscan_dev";
const DATABASE = "nutriscan";

export const DEV_DATABASE_URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  // O `initdb` herda o locale do sistema; em Windows em portugues isso gera um
  // cluster com codificacao WIN1252 e ordenacao dependente da maquina. Fixar em
  // UTF-8 e ordenacao C deixa o banco igual ao do Neon e ao do Docker.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (message) => {
    const text = String(message).trim();
    // O postgres escreve o log normal de subida em stderr; so repassa o que
    // parece problema de verdade.
    if (/FATAL|ERROR|PANIC/.test(text)) console.error(`[banco] ${text}`);
  },
});

async function stop(signal) {
  console.log(`\n[banco] encerrando (${signal})...`);
  try {
    await pg.stop();
  } catch {
    // Ja parado ou nunca subiu: nada a fazer.
  }
  process.exit(0);
}

async function main() {
  // `PG_VERSION` so existe depois de um `initdb` bem-sucedido. Rodar initdb de
  // novo num diretorio ja populado falha; por isso a checagem.
  const initialised = existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (!initialised) {
    console.log(`[banco] criando cluster em ${DATA_DIR}...`);
    await pg.initialise();
  }

  console.log(`[banco] subindo PostgreSQL na porta ${PORT}...`);
  await pg.start();

  try {
    await pg.createDatabase(DATABASE);
    console.log(`[banco] banco "${DATABASE}" criado.`);
  } catch (error) {
    // "already exists" e o caminho normal a partir da segunda execucao.
    if (!/already exists|ja existe/i.test(String(error?.message))) throw error;
  }

  console.log("[banco] aplicando migrations...");
  const migration = await npmCommand(["--prefix", "backend", "run", "db:migrate"], {
    env: { DATABASE_URL: DEV_DATABASE_URL, DATABASE_SSL: "false" },
    inherit: true,
  });
  if (migration.code !== 0) {
    console.error("[banco] migrations falharam; veja a saida acima.");
    await pg.stop();
    process.exit(migration.code);
  }

  console.log("");
  console.log("[banco] pronto. Use em backend/.env:");
  console.log(`  DATABASE_URL=${DEV_DATABASE_URL}`);
  console.log("  DATABASE_SSL=false");
  console.log("");
  console.log("[banco] Ctrl+C para encerrar. Os dados ficam em .pgdata/.");
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

main().catch(async (error) => {
  console.error(`[banco] falhou: ${error?.message || error}`);
  try {
    await pg.stop();
  } catch {
    // Nada a encerrar.
  }
  process.exit(1);
});
