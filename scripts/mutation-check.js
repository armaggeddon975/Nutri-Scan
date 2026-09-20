// Validacao por mutacao.
//
// Um teste que passa nao prova nada sozinho: ele pode estar verificando algo
// que e verdade independentemente do codigo sob teste. A unica forma de saber
// que um teste PROTEGE uma propriedade e quebrar a propriedade de proposito e
// exigir que o teste fique vermelho.
//
// Cada entrada abaixo injeta um defeito real no codigo, roda os testes que
// deveriam pega-lo e EXIGE falha. Se a mutacao passar despercebida, o script
// termina em erro: o teste correspondente e decorativo.
//
// O codigo original e restaurado sempre, inclusive se o processo for
// interrompido.
//
// Uso:
//   node scripts/mutation-check.js              so as mutacoes sem banco
//   node scripts/mutation-check.js --com-banco  inclui as que exigem PostgreSQL

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const comBanco = process.argv.includes("--com-banco");

const LIMITADOR = "backend/src/middleware/rateLimit.js";
const REPO_HISTORICO = "backend/src/repositories/historyRepository.js";
const REPO_FAVORITOS = "backend/src/repositories/favoritesRepository.js";

const SUITE_LIMITE = "tests/rateLimit.test.js";
const SUITE_INTEGRACAO = "tests/collectionsIntegration.test.js";

const MUTACOES = [
  {
    id: "M1",
    requisito: "Q5",
    descricao: "afrouxa o teto de autenticacao de 40 para 100 por janela",
    arquivo: LIMITADOR,
    de: "  limit: 40,",
    para: "  limit: 100,",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q5 os tres limitadores mantem janela e teto declarados",
    banco: false,
  },
  {
    id: "M2",
    requisito: "Q2",
    descricao: "eleva o teto de colecoes a um valor que nunca e alcancado",
    arquivo: LIMITADOR,
    de: "  limit: 300,",
    para: "  limit: 100000,",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q2 em producao o limitador recusa na requisicao seguinte ao teto",
    banco: false,
  },
  {
    id: "M3",
    requisito: "Q3",
    descricao: "cria um bypass por variavel de ambiente",
    arquivo: LIMITADOR,
    de: "  keyGenerator: collectionsRateLimitKey,",
    para:
      '  skip: () => process.env.RATE_LIMIT_OFF === "1",\n' +
      "  keyGenerator: collectionsRateLimitKey,",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q3 nenhuma variavel de ambiente desliga o limitador",
    banco: false,
  },
  {
    id: "M4",
    requisito: "Q4",
    descricao: "faz a chave depender de um cabecalho enviado pelo cliente",
    arquivo: LIMITADOR,
    de: "  const userId = req?.user?.id;",
    para: '  const userId = req?.get?.("x-usuario") ?? req?.user?.id;',
    suite: SUITE_LIMITE,
    deveQuebrar: "Q4 nenhum dado vindo do request consegue um balde novo",
    banco: false,
  },
  {
    id: "M4b",
    requisito: "Q4",
    descricao: "adiciona um skip acionado por cabecalho, sem variavel de ambiente",
    arquivo: LIMITADOR,
    de: "  keyGenerator: collectionsRateLimitKey,",
    para: '  skip: (req) => req.get("x-livre") === "1",\n  keyGenerator: collectionsRateLimitKey,',
    suite: SUITE_LIMITE,
    deveQuebrar: "Q4 o limitador nao tem opcao de pular requisicao",
    banco: false,
  },
  {
    id: "M5",
    requisito: "D1",
    descricao: "volta a contar por IP, que e exatamente o defeito relatado",
    arquivo: LIMITADOR,
    de: "  if (userId) return `user:${userId}`;",
    para: "  if (false && userId) return `user:${userId}`;",
    suite: SUITE_LIMITE,
    deveQuebrar: "D1 a cota de um usuario nao consome a cota de outro",
    banco: false,
  },
  {
    id: "M6",
    requisito: "Q7",
    descricao: "remove o filtro por dono da leitura de historico",
    arquivo: REPO_HISTORICO,
    de: "FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC",
    para: "FROM product_history WHERE $1 IS NOT NULL ORDER BY viewed_at DESC",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "I1 usuario A nao le historico nem favorito de B",
    banco: true,
  },
  {
    id: "M7",
    requisito: "Q7",
    descricao: "remove o filtro por dono da remocao de favorito",
    arquivo: REPO_FAVORITOS,
    de: "DELETE FROM product_favorites WHERE user_id = $1 AND id = $2 RETURNING id",
    para: "DELETE FROM product_favorites WHERE $1 IS NOT NULL AND id = $2 RETURNING id",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "I2 usuario B nao remove item de A",
    banco: true,
  },
];

function rodar(suite) {
  try {
    const saida = execFileSync(
      process.execPath,
      ["--test", "--test-concurrency=1", suite],
      { cwd: path.join(raiz, "backend"), encoding: "utf8", stdio: "pipe", timeout: 900000 },
    );
    return { codigo: 0, saida };
  } catch (erro) {
    return {
      codigo: erro.status ?? 1,
      saida: `${erro.stdout ?? ""}${erro.stderr ?? ""}`,
    };
  }
}

function falhasDe(saida) {
  return saida
    .split(/\r?\n/)
    .filter((linha) => /^\s*(✖|not ok)/.test(linha))
    .map((linha) =>
      linha
        .replace(/^\s*(✖|not ok\s*\d*\s*-?)\s*/, "")
        .replace(/\s*\([\d.]+ms\)\s*$/, ""),
    );
}

// Restauracao garantida: se o processo morrer no meio, o arquivo mutado volta
// ao original antes de sair. Deixar uma mutacao para tras seria pior que nao
// ter rodado o script.
const pendentes = [];
process.on("exit", () => {
  for (const { caminho, original } of pendentes) writeFileSync(caminho, original);
});
for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => process.exit(130));
}

const resultados = [];

for (const m of MUTACOES) {
  if (m.banco && !comBanco) {
    resultados.push({
      ...m,
      estado: "NAO EXECUTADO",
      detalhe: "exige PostgreSQL; rode com --com-banco",
    });
    console.log(`- ${m.id} (${m.requisito}) NAO EXECUTADO: exige PostgreSQL`);
    continue;
  }

  const caminho = path.join(raiz, m.arquivo);
  const original = readFileSync(caminho, "utf8");

  const ocorrencias = original.split(m.de).length - 1;
  if (ocorrencias !== 1) {
    resultados.push({
      ...m,
      estado: "INAPLICAVEL",
      detalhe: `o trecho alvo aparece ${ocorrencias} vezes, esperado 1`,
    });
    console.log(`- ${m.id} (${m.requisito}) INAPLICAVEL: alvo aparece ${ocorrencias} vezes`);
    continue;
  }

  const registro = { caminho, original };
  pendentes.push(registro);
  writeFileSync(caminho, original.replace(m.de, m.para));

  console.log(`- ${m.id} (${m.requisito}) ${m.descricao}...`);
  const { codigo, saida } = rodar(m.suite);

  writeFileSync(caminho, original);
  pendentes.splice(pendentes.indexOf(registro), 1);

  const falhas = falhasDe(saida);
  const pegou = falhas.some((nome) => nome.includes(m.deveQuebrar));

  if (codigo === 0) {
    resultados.push({
      ...m,
      estado: "MUTACAO SOBREVIVEU",
      detalhe: "a suite passou com o defeito aplicado",
    });
    console.log("  MUTACAO SOBREVIVEU - a suite passou com o defeito. O teste nao protege nada.");
  } else if (!pegou) {
    resultados.push({
      ...m,
      estado: "PEGO PELO TESTE ERRADO",
      detalhe: `falharam: ${falhas.join("; ") || "(nenhum teste nomeado)"}`,
    });
    console.log(`  PEGO PELO TESTE ERRADO - falharam: ${falhas.join("; ") || "(nenhum)"}`);
  } else {
    resultados.push({ ...m, estado: "MORTA", detalhe: `"${m.deveQuebrar}" falhou, como deveria` });
    console.log(`  MORTA - "${m.deveQuebrar}" ficou vermelho, como deveria`);
  }
}

console.log("");
console.log("=".repeat(78));
const mortas = resultados.filter((r) => r.estado === "MORTA");
const naoExecutadas = resultados.filter((r) => r.estado === "NAO EXECUTADO");
const problemas = resultados.filter((r) => r.estado !== "MORTA" && r.estado !== "NAO EXECUTADO");

for (const r of resultados) {
  console.log(`${r.id}  ${r.requisito.padEnd(4)} ${r.estado.padEnd(22)} ${r.detalhe}`);
}
console.log("=".repeat(78));
console.log(
  `mortas ${mortas.length} | nao executadas ${naoExecutadas.length} | problemas ${problemas.length}`,
);

if (problemas.length > 0) {
  console.log("");
  console.log("REPROVADO: ha teste que nao detecta o defeito que deveria detectar.");
  process.exitCode = 1;
} else if (naoExecutadas.length > 0) {
  console.log("");
  console.log("Mutacoes sem banco: OK. As que exigem PostgreSQL ficaram NAO EXECUTADAS.");
} else {
  console.log("");
  console.log("APROVADO: toda mutacao foi detectada pelo teste correspondente.");
}
