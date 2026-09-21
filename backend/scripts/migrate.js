import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

import { env } from "../src/config/env.js";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../migrations");

if (!env.databaseUrl) {
  console.error("DATABASE_URL não configurada.");
  process.exit(1);
}

const client = new Client({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
});

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function hasMigration(filename) {
  const result = await client.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
    [filename],
  );
  return Boolean(result.rowCount);
}

async function run() {
  await client.connect();
  try {
    await ensureMigrationsTable();

    // MIGRATIONS EM .js, ALEM DE .sql (v0.7.4)
    //
    // A migration 003 precisa decidir se um codigo de 12 digitos e um UPC-A de
    // verdade, e isso depende do digito verificador. Escrever esse calculo em
    // SQL seria uma SEGUNDA implementacao da regra que vive em
    // `shared/barcode.js` - exatamente o tipo de copia que diverge com o tempo,
    // e que o proprio prompt da versao proibe.
    //
    // Uma migration em JavaScript importa a funcao compartilhada e usa a mesma
    // regra do backend e do frontend. Ela e registrada em `schema_migrations`
    // pelo nome do arquivo, como qualquer outra, entao a idempotencia vem do
    // mesmo mecanismo: aplicada uma vez, e pulada nas seguintes.
    //
    // Os dois tipos sao ordenados juntos pelo nome, para que a numeracao
    // continue definindo a ordem.
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql") || file.endsWith(".js"))
      .sort();

    for (const file of files) {
      if (await hasMigration(file)) {
        console.log(`skip ${file}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        if (file.endsWith(".js")) {
          const modulo = await import(pathToFileURL(path.join(migrationsDir, file)).href);
          if (typeof modulo.up !== "function") {
            throw new Error(`${file} nao exporta uma funcao \`up\``);
          }
          await modulo.up(client);
        } else {
          const sql = await readFile(path.join(migrationsDir, file), "utf8");
          await client.query(sql);
        }

        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
