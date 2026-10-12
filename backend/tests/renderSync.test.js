import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

// v0.7.6 - Entrega A: o que o codigo exige e o que o `render.yaml` declara.
//
// `VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO` vive em `backend/src/config/env.js`; o
// `render.yaml` lista variaveis por conta propria. Ate esta versao nada
// garantia que as duas listas concordassem. Uma obrigatoria nova no codigo,
// esquecida no `render.yaml`, faria o deploy subir e morrer - e a mensagem so
// apareceria no log da hospedagem, depois de publicar.

// ---------------------------------------------------------------------------
// Leitura do render.yaml
// ---------------------------------------------------------------------------
//
// O projeto nao tem biblioteca de YAML, e nao vale a pena acrescentar uma
// dependencia para um bloco so. Este leitor entende APENAS o formato do bloco
// `envVars` - `- key:` seguido de campos conhecidos - e FALHA diante de qualquer
// outra coisa. Um leitor tolerante que pulasse a linha estranha poderia deixar
// passar justamente a variavel que importa.
const CAMPOS_CONHECIDOS = ["value", "sync", "generateValue"];

export function lerEnvVarsDoRender(texto) {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos = linhas.filter((linha) => /^\s*envVars:\s*$/.test(linha)).length;
  if (blocos !== 1) throw new Error(`render.yaml tem ${blocos} blocos envVars; este teste entende 1`);

  const inicio = linhas.findIndex((linha) => /^\s*envVars:\s*$/.test(linha));
  const recuoDoBloco = linhas[inicio].search(/\S/);
  const entradas = [];
  let atual = null;

  for (let i = inicio + 1; i < linhas.length; i += 1) {
    // Comentario de linha inteira, ou comentario depois de espaco.
    const util = linhas[i].replace(/^\s*#.*$/, "").replace(/\s+#.*$/, "");
    if (!util.trim()) continue;
    if (util.search(/\S/) <= recuoDoBloco) break; // saiu do bloco

    const item = /^\s*-\s+key:\s*(\S+)\s*$/.exec(util);
    if (item) {
      atual = { key: item[1], campos: {}, linha: i + 1 };
      entradas.push(atual);
      continue;
    }

    const campo = /^\s*([A-Za-z]+):\s*(.*?)\s*$/.exec(util);
    if (!campo || !atual || !CAMPOS_CONHECIDOS.includes(campo[1])) {
      throw new Error(`render.yaml, linha ${i + 1}: formato que este teste nao conhece: "${linhas[i].trim()}"`);
    }
    atual.campos[campo[1]] = campo[2].replace(/^(["'])(.*)\1$/, "$2");
  }

  return entradas;
}

// ---------------------------------------------------------------------------
// O que o codigo le
// ---------------------------------------------------------------------------
//
// O que roda no Render: o servidor (`backend/src`) e a migration do build
// (`backend/scripts`). Um script de desenvolvimento em `scripts/` nao conta - ele
// nao roda na hospedagem.
const PASTAS_QUE_RODAM_NO_RENDER = ["backend/src", "backend/scripts"];

async function arquivosJs(pasta) {
  const saida = [];
  for (const entrada of await readdir(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) saida.push(...(await arquivosJs(caminho)));
    else if (entrada.name.endsWith(".js")) saida.push(caminho);
  }
  return saida;
}

async function variaveisLidasPeloCodigo() {
  const lidas = new Set();
  for (const pasta of PASTAS_QUE_RODAM_NO_RENDER) {
    for (const arquivo of await arquivosJs(path.join(rootDir, pasta))) {
      const fonte = await readFile(arquivo, "utf8");
      for (const m of fonte.matchAll(/process\.env\.([A-Z0-9_]+)/g)) lidas.add(m[1]);
      for (const m of fonte.matchAll(/process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g)) lidas.add(m[1]);
    }
  }
  return lidas;
}

// ---------------------------------------------------------------------------
// Os casos conhecidos - declarados, e nao excecao silenciosa
// ---------------------------------------------------------------------------

// ANTHROPIC_API_KEY NAO e obrigatoria para SUBIR: sem ela o assistente
// responde localmente e o veredito de alergia, que nao depende de IA, continua
// igual. Mas ela PRECISA constar no `render.yaml`, porque sem a entrada no
// arquivo o painel nao a oferece, e o app iria para producao sem IA por
// esquecimento, e nao por decisao.
const OPCIONAIS_QUE_PRECISAM_ESTAR_NO_RENDER = ["ANTHROPIC_API_KEY"];

// NODE_VERSION e lida pelo PROPRIO Render, para escolher a versao do Node do
// build e da execucao. O codigo nao a le, e isso e certo: nao e configuracao
// morta, e configuracao da plataforma.
const LIDAS_PELA_PLATAFORMA = { NODE_VERSION: "o Render escolhe a versao do Node por ela" };

// Credencial: o valor nunca pode estar no Git. No `render.yaml`, ela tem de ser
// `sync: false` - preenchida no painel - e nunca ter `value`.
const CREDENCIAIS_CONHECIDAS = ["DATABASE_URL", "ANTHROPIC_API_KEY"];
function pareceCredencial(nome) {
  return CREDENCIAIS_CONHECIDAS.includes(nome) || /(SECRET|TOKEN|PASSWORD|_KEY$|_URL$)/.test(nome);
}

async function lerRender() {
  return lerEnvVarsDoRender(await readFile(path.join(rootDir, "render.yaml"), "utf8"));
}

/** Obrigatorias do codigo que faltam no render.yaml. */
export function faltandoNoRender(obrigatorias, entradas) {
  const declaradas = new Set(entradas.map((e) => e.key));
  return obrigatorias.filter((nome) => !declaradas.has(nome));
}

// ---------------------------------------------------------------------------
// S1 - toda obrigatoria do codigo esta no render.yaml
// ---------------------------------------------------------------------------

test("S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO", async () => {
  const entradas = await lerRender();
  assert.ok(VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO.length >= 4, "a lista de obrigatorias encolheu");
  assert.deepEqual(
    faltandoNoRender(VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO, entradas),
    [],
    "obrigatoria do codigo ausente do render.yaml: o deploy subiria e morreria",
  );
});

test("S1 ANTHROPIC_API_KEY e opcional para subir, e mesmo assim esta no render.yaml", async () => {
  const entradas = await lerRender();
  for (const nome of OPCIONAIS_QUE_PRECISAM_ESTAR_NO_RENDER) {
    assert.equal(VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO.includes(nome), false, `${nome} virou obrigatoria`);
    assert.ok(entradas.some((e) => e.key === nome), `${nome} sumiu do render.yaml: producao ficaria sem IA`);
  }
});

// ---------------------------------------------------------------------------
// S2 - o render.yaml nao declara variavel que o codigo nao le
// ---------------------------------------------------------------------------

test("S2 render.yaml nao declara variavel que o codigo nao le", async () => {
  const entradas = await lerRender();
  const lidas = await variaveisLidasPeloCodigo();

  const mortas = entradas
    .map((e) => e.key)
    .filter((nome) => !lidas.has(nome) && !Object.hasOwn(LIDAS_PELA_PLATAFORMA, nome));
  assert.deepEqual(mortas, [], "configuracao morta no render.yaml: o codigo nao le estas variaveis");
});

test("S2 as variaveis de plataforma declaradas existem de fato no render.yaml", async () => {
  // Um caso conhecido que ninguem usa vira excecao esquecida.
  const entradas = await lerRender();
  for (const nome of Object.keys(LIDAS_PELA_PLATAFORMA)) {
    assert.ok(entradas.some((e) => e.key === nome), `${nome} esta na lista de plataforma mas nao no render.yaml`);
  }
});

// ---------------------------------------------------------------------------
// S3 - nenhuma credencial com valor literal no render.yaml
// ---------------------------------------------------------------------------

test("S3 nenhuma credencial com valor literal no render.yaml", async () => {
  const entradas = await lerRender();
  const credenciais = entradas.filter((e) => pareceCredencial(e.key));

  for (const nome of CREDENCIAIS_CONHECIDAS) {
    assert.ok(credenciais.some((e) => e.key === nome), `${nome} nao foi encontrada como credencial`);
  }
  for (const entrada of credenciais) {
    assert.equal("value" in entrada.campos, false, `${entrada.key} tem valor literal no Git (linha ${entrada.linha})`);
    assert.equal(entrada.campos.sync, "false", `${entrada.key} precisa de sync: false (linha ${entrada.linha})`);
  }
});

test("S3 entrada sync: false nunca carrega valor", async () => {
  // `sync: false` com `value` e contraditorio: o valor iria para o Git do mesmo
  // jeito.
  for (const entrada of await lerRender()) {
    if (entrada.campos.sync === "false") {
      assert.equal("value" in entrada.campos, false, `${entrada.key}: sync false com value`);
    }
  }
});

// ---------------------------------------------------------------------------
// 5.3 - nada no render.yaml induz FRONTEND_ORIGIN a http://
// ---------------------------------------------------------------------------

test("5.3 FRONTEND_ORIGIN e preenchida no painel, e o render.yaml nao sugere http://", async () => {
  const texto = await readFile(path.join(rootDir, "render.yaml"), "utf8");
  const origem = (await lerRender()).find((e) => e.key === "FRONTEND_ORIGIN");

  assert.ok(origem, "FRONTEND_ORIGIN sumiu do render.yaml");
  if ("value" in origem.campos) {
    assert.match(origem.campos.value, /^https:\/\//, "FRONTEND_ORIGIN com valor que nao e https://");
  } else {
    assert.equal(origem.campos.sync, "false");
  }
  // Nem em comentario: quem le o arquivo copia o exemplo.
  assert.doesNotMatch(texto, /http:\/\//, "o render.yaml mostra um endereco http://");
});

// ---------------------------------------------------------------------------
// S4 - a conferencia pega a obrigatoria esquecida
// ---------------------------------------------------------------------------
//
// A prova forte de S4 e a validacao por mutacao (mutante V1: acrescenta uma
// obrigatoria em env.js sem tocar no render.yaml, e S1 tem de ficar vermelho).
// Este teste e a prova local, sem mutar arquivo nenhum.

test("S4 uma obrigatoria nova sem entrada no render.yaml e apontada pelo nome", async () => {
  const entradas = await lerRender();
  const comNova = [...VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO, "VARIAVEL_NOVA_OBRIGATORIA"];
  assert.deepEqual(faltandoNoRender(comNova, entradas), ["VARIAVEL_NOVA_OBRIGATORIA"]);
});

test("S4 o leitor do render.yaml falha diante de formato desconhecido, nao pula", () => {
  const texto = ["envVars:", "  - key: DATABASE_URL", "    fromDatabase:", "      name: banco", ""].join("\n");
  assert.throws(() => lerEnvVarsDoRender(texto), /formato que este teste nao conhece/);
  assert.throws(() => lerEnvVarsDoRender("services:\n  - type: web\n"), /blocos envVars/);
});
