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
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const comBanco = process.argv.includes("--com-banco");

const LIMITADOR = "backend/src/middleware/rateLimit.js";
const REPO_HISTORICO = "backend/src/repositories/historyRepository.js";
const REPO_FAVORITOS = "backend/src/repositories/favoritesRepository.js";

const SUITE_LIMITE = "tests/rateLimit.test.js";
const SUITE_INTEGRACAO = "tests/collectionsIntegration.test.js";

const COMPOSICAO = "  return [porUsuario, porIp];";

const MUTACOES = [
  {
    id: "N1",
    requisito: "R1/R3",
    descricao: "remove o teto por IP e deixa so o de usuario (o defeito E1)",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porUsuario];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R1 usuario dentro do teto mas IP estourado recebe 429",
    banco: false,
  },
  {
    id: "N1b",
    requisito: "R3",
    descricao: "remove o teto por IP: multiplas contas voltam a passar sem limite",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porUsuario];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP",
    banco: false,
  },
  {
    id: "N2",
    requisito: "R2",
    descricao: "remove o teto por usuario e deixa so o de IP (o defeito D1)",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porIp];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R2 IP dentro do teto mas usuario estourado recebe 429",
    banco: false,
  },
  {
    id: "N2b",
    requisito: "R4",
    descricao: "remove o teto por usuario: vizinhos de NAT voltam a se derrubar",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porIp];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R4 dois usuarios atras do MESMO IP mantem cotas separadas",
    banco: false,
  },
  {
    id: "N3",
    requisito: "R4",
    descricao: "confere o IP antes do usuario: recusas passam a gastar cota do IP",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porIp, porUsuario];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP",
    banco: false,
  },
  {
    id: "N4",
    requisito: "R5",
    descricao: "le o balde de IP de um cabecalho do request",
    arquivo: LIMITADOR,
    de:
      "export function collectionsIpRateLimitKey(req) {\n" +
      "  return `ip:${normalizarIp(req?.ip)}`;\n" +
      "}",
    para:
      "export function collectionsIpRateLimitKey(req) {\n" +
      '  return `ip:${normalizarIp(req?.get?.("x-real-ip") ?? req?.ip)}`;\n' +
      "}",
    suite: SUITE_LIMITE,
    deveQuebrar: "R5 dados forjados no request nao conseguem balde de IP novo",
    banco: false,
  },
  {
    id: "N5",
    requisito: "R5",
    descricao: "para de normalizar IPv6: um bloco /64 vira 2^64 baldes",
    arquivo: LIMITADOR,
    de: '  return `${grupos.slice(0, 4).map((g) => g || "0").join(":")}::/64`;',
    para: "  return semZona;",
    suite: SUITE_LIMITE,
    deveQuebrar: "R5 um bloco IPv6 /64 nao vira infinitos baldes",
    banco: false,
  },
  {
    id: "M1",
    requisito: "R6",
    descricao: "afrouxa o teto de autenticacao de 40 para 100 por janela",
    arquivo: LIMITADOR,
    de: "  limit: 40,",
    para: "  limit: 100,",
    suite: SUITE_LIMITE,
    deveQuebrar: "R6 os tres tetos por rota seguem nos valores declarados",
    banco: false,
  },
  {
    id: "M2",
    requisito: "R7",
    descricao: "derruba o teto por IP para um valor que quebraria a suite",
    arquivo: LIMITADOR,
    de: "export const TETO_COLECOES_POR_IP = 3000;",
    para: "export const TETO_COLECOES_POR_IP = 300;",
    suite: SUITE_LIMITE,
    deveQuebrar: "R7 o teto por IP esta no valor medido",
    banco: false,
  },
  {
    id: "M3",
    requisito: "Q3",
    descricao: "cria um bypass por variavel de ambiente",
    arquivo: LIMITADOR,
    de: "    keyGenerator: collectionsRateLimitKey,",
    para:
      '    skip: () => process.env.RATE_LIMIT_OFF === "1",\n' +
      "    keyGenerator: collectionsRateLimitKey,",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q3 nenhuma variavel de ambiente desliga os limitadores",
    banco: false,
  },
  {
    id: "M3b",
    requisito: "Q4",
    descricao: "adiciona um skip acionado por cabecalho, sem variavel de ambiente",
    arquivo: LIMITADOR,
    de: "    keyGenerator: collectionsRateLimitKey,",
    para: '    skip: (req) => req.get("x-livre") === "1",\n    keyGenerator: collectionsRateLimitKey,',
    suite: SUITE_LIMITE,
    deveQuebrar: "Q4 nenhum dos limitadores tem opcao de pular requisicao",
    banco: false,
  },
  {
    id: "M4",
    requisito: "Q2",
    descricao: "eleva o teto por usuario a um valor que nunca e alcancado",
    arquivo: LIMITADOR,
    de: "export const TETO_COLECOES_POR_USUARIO = 300;",
    para: "export const TETO_COLECOES_POR_USUARIO = 100000;",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto",
    banco: false,
  },
  {
    id: "M6",
    requisito: "R9",
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
    requisito: "R9",
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

// RESTAURACAO QUE SOBREVIVE A MORTE DO PROCESSO
//
// A primeira versao disto confiava so em `process.on("exit")`. Na v0.7.2 uma
// execucao foi interrompida de fora, o manipulador nao rodou, e o repositorio
// ficou com a mutacao M4 aplicada: `TETO_COLECOES_POR_USUARIO = 100000`, ou
// seja, o limitador de producao praticamente desligado. Passou despercebido ate
// a conferencia seguinte. Um script que injeta defeitos de proposito nao pode
// depender de sair com educacao.
//
// Agora o conteudo original vai para um arquivo ANTES da mutacao. Se o processo
// morrer, o proximo comeca lendo esse arquivo e desfaz o estrago.
const JORNAL = path.join(raiz, "scripts/.mutation-restore.json");

function anotarNoJornal(caminho, original) {
  writeFileSync(JORNAL, JSON.stringify({ caminho, original }), "utf8");
}

function limparJornal() {
  if (existsSync(JORNAL)) rmSync(JORNAL);
}

function restaurarJornalPendente() {
  if (!existsSync(JORNAL)) return;
  try {
    const { caminho, original } = JSON.parse(readFileSync(JORNAL, "utf8"));
    writeFileSync(caminho, original);
    console.log(`[aviso] execucao anterior foi interrompida; ${path.relative(raiz, caminho)} restaurado`);
  } catch (erro) {
    console.error(`[ERRO] jornal de restauracao ilegivel: ${erro.message}`);
    console.error(`Confira ${JORNAL} e o estado do repositorio A MAO antes de continuar.`);
    process.exit(1);
  }
  limparJornal();
}

restaurarJornalPendente();

const pendentes = [];
process.on("exit", () => {
  for (const { caminho, original } of pendentes) writeFileSync(caminho, original);
  if (pendentes.length === 0) limparJornal();
});
for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
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
  anotarNoJornal(caminho, original);
  writeFileSync(caminho, original.replace(m.de, m.para));

  console.log(`- ${m.id} (${m.requisito}) ${m.descricao}...`);
  const { codigo, saida } = rodar(m.suite);

  writeFileSync(caminho, original);
  pendentes.splice(pendentes.indexOf(registro), 1);
  limparJornal();

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
