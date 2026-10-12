import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// A migration roda no BUILD do Render (`npm run db:migrate`). Se ela falhar, o
// build falha e a versao anterior continua no ar - o que e bom. Mas o log
// precisa dizer POR QUE.
//
// Ate a v0.7.6 ele saia em branco: `migrate.js` imprimia so `error.message`, e
// uma conexao recusada a um host com IPv4 e IPv6 vira `AggregateError`, cuja
// `message` e vazia. Medido: `localhost` produz exatamente esse erro.

// Porta 1 em `localhost`: recusa rapida, nos dois enderecos. A senha e uma isca
// para conferir que ela nunca aparece no log.
const BANCO_FORA = "postgresql://usuario_falso:senha_isca_migracao@localhost:1/banco_inexistente";

function rodarMigracao(ambiente) {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, ["scripts/migrate.js"], {
      cwd: backendRoot,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...ambiente },
    });
    let stdout = "";
    let stderr = "";
    filho.stdout.on("data", (parte) => (stdout += parte));
    filho.stderr.on("data", (parte) => (stderr += parte));
    filho.on("error", reject);
    filho.on("close", (codigo) => resolve({ codigo, stdout, stderr }));
  });
}

test("MIG migration que nao alcanca o banco falha dizendo por que", async () => {
  const saida = await rodarMigracao({ DATABASE_URL: BANCO_FORA, DATABASE_SSL: "false", NODE_ENV: "production" });

  assert.equal(saida.codigo, 1, `a migration saiu com ${saida.codigo}`);
  assert.match(saida.stderr, /Migration falhou/);
  assert.match(saida.stderr, /ECONNREFUSED/, `o log nao diz que a conexao foi recusada:\n${saida.stderr}`);
  assert.ok(saida.stderr.trim().split(/\r?\n/).length >= 2, "o log da falha saiu sem detalhe");
});

test("MIG a falha da migration nunca imprime a senha nem a string de conexao", async () => {
  const saida = await rodarMigracao({ DATABASE_URL: BANCO_FORA, DATABASE_SSL: "false", NODE_ENV: "production" });

  assert.equal(saida.stderr.includes("senha_isca_migracao"), false, "a senha apareceu no log");
  assert.equal(saida.stderr.includes("postgresql://"), false, "a string de conexao apareceu no log");
});

test("MIG URL de banco malformada falha sem ecoar a URL", async () => {
  // O `TypeError` de URL invalida carrega a entrada INTEIRA em `error.input`.
  const saida = await rodarMigracao({
    DATABASE_URL: "postgresql://usuario_falso:senha_isca_migracao@[host-quebrado/banco",
    DATABASE_SSL: "false",
    NODE_ENV: "production",
  });

  assert.equal(saida.codigo, 1);
  assert.match(saida.stderr, /Migration falhou/);
  assert.equal(saida.stderr.includes("senha_isca_migracao"), false, "a senha apareceu no log");
});
