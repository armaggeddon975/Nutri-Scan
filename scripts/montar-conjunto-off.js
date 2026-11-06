import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { statusLine } from "./common.js";
import { ARQUIVO_DO_CONJUNTO, hashDosCampos } from "./lib/medicaoDoMotor.js";

// MONTAGEM DO CONJUNTO DA MEDICAO DO MOTOR (v0.14.0)
//
// Este e o UNICO script da medicao que fala com a rede. Ele consulta a Open
// Food Facts real, somente leitura, escolhe produtos por regras fixas e grava o
// resultado em `medicao/conjunto-off.json`. A medicao em si
// (`npm run medir:motor`) le so esse arquivo e roda sem rede.
//
// Fica desligado sem `RUN_OFF_INTEGRATION_TESTS=true`, a mesma chave dos testes
// que falam com a OFF real.
//
//   RUN_OFF_INTEGRATION_TESTS=true node scripts/montar-conjunto-off.js
//       escolhe os produtos e grava o conjunto, com o gabarito vazio. Recusa
//       sobrescrever um conjunto que ja existe.
//   RUN_OFF_INTEGRATION_TESTS=true node scripts/montar-conjunto-off.js --atualizar
//       busca de novo os campos dos produtos que ja estao no conjunto e mantem
//       o gabarito. Se o texto de um produto mudou, o gabarito dele deixa de
//       bater com o texto (`conferidoContra`) e a medicao recusa o conjunto ate
//       alguem reler o rotulo.
//
// O gabarito NAO e escrito por este script, nem pelo motor, nem por modelo de
// IA: e a leitura humana do texto de cada produto (ver docs/MEDICAO_DO_MOTOR.md).
//
// Os produtos da OFF sao dado de terceiro, nao confiavel. O texto deles so e
// gravado como string num JSON; nada dele vira codigo.

const SEARCH_BASE = "https://world.openfoodfacts.org/api/v2/search";
// O reserva que o app tambem usa: a busca v2 responde 503 de forma intermitente
// (medido de novo em 30/10/2026). Mesma ordenacao, mesmo filtro de pais.
const LEGACY_SEARCH_BASE = "https://world.openfoodfacts.org/cgi/search.pl";
// O mesmo endpoint e os mesmos campos que o app usa ao ler um codigo de barras
// (src/services/openFoodFactsService.js): o motor recebe na medicao exatamente
// o que receberia no aparelho.
const PRODUCT_BASE = "https://world.openfoodfacts.org/api/v3/product";
const CAMPOS_DO_APP = [
  "code",
  "product_name",
  "brands",
  "ingredients_text",
  "ingredients_text_pt",
  "ingredients_text_en",
  "allergens_tags",
  "traces_tags",
  "traces",
  "labels_tags",
];
const CAMPOS_DA_SELECAO = ["code", "lang", "product_name", "ingredients_text_pt", "ingredients_text", "ingredients_text_en"];

const AGENTE = "NutriScan-medicao/0.14.0 (montagem do conjunto de teste, somente leitura)";
const ESPERA_ENTRE_BUSCAS_MS = 7000; // a OFF limita a busca a 10 chamadas por minuto
const ESPERA_ENTRE_PRODUTOS_MS = 800; // e a leitura de produto a 100 por minuto
const RETENTATIVAS_MS = [5000, 15000, 30000, 60000];
// As paginas de busca ficam guardadas por dia fora do projeto: se a OFF cair no
// meio da montagem, a volta continua de onde parou, com a MESMA leitura.
const PASTA_DAS_PAGINAS = path.join(tmpdir(), "nutriscan-medicao-paginas");
const HOJE = new Date().toISOString().slice(0, 10);
// `--paginas-de=AAAA-MM-DD` refaz a escolha sobre as paginas lidas naquele dia,
// sem buscar de novo: a mesma selecao, mesmo que a OFF tenha mudado depois. Se
// alguma pagina daquele dia faltar, o script para em vez de completar com a de
// hoje.
const OPCAO_PAGINAS = process.argv.find((arg) => arg.startsWith("--paginas-de="));
const DATA_DAS_PAGINAS = OPCAO_PAGINAS ? OPCAO_PAGINAS.split("=")[1] : HOJE;

// --- regras de selecao: fixas, escritas ANTES de qualquer medicao ------------

const POOLS = {
  // Os produtos vendidos no Brasil, do mais lido ao menos lido.
  br: { pais: "brazil", paginas: 10, porPagina: 100 },
  // Reserva para o grupo so-ingles, se o pool brasileiro nao tiver o bastante.
  en: { pais: "united-states", paginas: 1, porPagina: 100 },
};

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const texto = (valor) => (typeof valor === "string" ? valor.trim() : "");
const textoPt = (p) => texto(p.ingredients_text_pt) || (p.lang === "pt" ? texto(p.ingredients_text) : "");
const temTextoPt = (p) => textoPt(p).length >= 15;
const semTexto = (p) => !texto(p.ingredients_text_pt) && !texto(p.ingredients_text) && !texto(p.ingredients_text_en);
// So ingles: o app nao ve nenhum texto que nao seja ingles.
const soIngles = (p) =>
  !texto(p.ingredients_text_pt) &&
  (texto(p.ingredients_text_en).length >= 15 || (p.lang === "en" && texto(p.ingredients_text).length >= 15)) &&
  (!texto(p.ingredients_text) || p.lang === "en");

// O campo `lang` da OFF nao garante o idioma do texto (medido nesta montagem:
// produtos com lang=en e texto em portugues, holandes ou frances). O grupo
// ingles-eua confere o proprio texto: palavras comuns de rotulo em ingles e
// nenhuma letra acentuada de portugues, frances ou espanhol.
const PALAVRAS_DE_ROTULO_EM_INGLES = /(^|[^a-z])(sugar|salt|water|flour|oil)([^a-z]|$)/i;
const ACENTO_DE_OUTRA_LINGUA = /[\u00c0-\u00ff]/;
const inglesConferido = (p) =>
  soIngles(p) &&
  PALAVRAS_DE_ROTULO_EM_INGLES.test(texto(p.ingredients_text_en) || texto(p.ingredients_text)) &&
  !ACENTO_DE_OUTRA_LINGUA.test(texto(p.ingredients_text_en) || texto(p.ingredients_text));

const ALERGENOS_NA_SELECAO = "(leite|lactose|soro|trigo|soja|ovos?|amendoim|castanhas?|cevada|malte|centeio|aveia|gergelim|peixe)";
const NEGACAO = /(^|[^a-z0-9])(sem|zero|isento de|isenta de|livre de|nao contem)\s+(lactose|gluten|leite|soja|ovos?|amendoim|trigo)([^a-z0-9]|$)/;
// A negacao de gluten ("NAO CONTEM GLUTEN") e obrigatoria no rotulo brasileiro
// e enche o grupo negacao sozinha. Este padrao pega a negacao de lactose, que e
// a que mais engana: leite sem lactose continua sendo leite.
const NEGACAO_DE_LACTOSE = /(^|[^a-z0-9])(sem|zero|isento de|isenta de|livre de|nao contem|0%)\s+(de\s+)?lactose([^a-z0-9]|$)/;
const TRACO = /(^|[^a-z0-9])(pode conter|podem conter|tracos? de|contem tracos)([^a-z0-9]|$)/;
const DENTRO_DE_OUTRO = new RegExp(`\\([^()]*(^|[^a-z0-9])${ALERGENOS_NA_SELECAO}([^a-z0-9]|$)[^()]*\\)`);
const GRAFIA =
  /(^|[^a-z0-9])(leite em po|soro de leite|soro do leite|lactose|caseina|caseinato|whey|creme de leite|queijo|manteiga|lacteo|lactea|nata|iogurte)([^a-z0-9]|$)/;

// A ordem importa: cada produto entra no PRIMEIRO grupo que o aceita, e o grupo
// tipico vem antes de todos para ser uma amostra sem filtro dos mais lidos.
export const GRUPOS = [
  {
    id: "tipico",
    cota: 15,
    pools: ["br"],
    criterio: "os primeiros produtos com lista de ingredientes em portugues, na ordem da busca, sem outro filtro",
    aceita: temTextoPt,
  },
  {
    id: "negacao",
    cota: 10,
    pools: ["br"],
    criterio: "texto em portugues com sem/zero/isento de/livre de/nao contem seguido de lactose, gluten, leite, soja, ovo, amendoim ou trigo",
    aceita: (p) => temTextoPt(p) && NEGACAO.test(normalizar(textoPt(p))),
  },
  {
    id: "traco",
    cota: 10,
    pools: ["br"],
    criterio: "texto em portugues com pode conter / podem conter / tracos de / contem tracos",
    aceita: (p) => temTextoPt(p) && TRACO.test(normalizar(textoPt(p))),
  },
  {
    id: "dentro-de-outro",
    cota: 8,
    pools: ["br"],
    criterio: "texto em portugues com um alergenico dentro dos parenteses de outro ingrediente",
    aceita: (p) => temTextoPt(p) && DENTRO_DE_OUTRO.test(normalizar(textoPt(p))),
  },
  {
    id: "grafia",
    cota: 8,
    pools: ["br"],
    criterio: "texto em portugues com leite escrito de outro jeito: leite em po, soro de leite, lactose, caseina, whey, creme de leite, queijo, manteiga, lacteo, nata, iogurte",
    aceita: (p) => temTextoPt(p) && GRAFIA.test(normalizar(textoPt(p))),
  },
  {
    id: "vazio",
    cota: 5,
    pools: ["br"],
    criterio: "produto vendido no Brasil sem nenhuma lista de ingredientes (pt, principal e en vazias)",
    aceita: semTexto,
  },
  {
    id: "so-ingles",
    cota: 6,
    pools: ["br", "en"],
    criterio: "o unico texto que o app recebe esta em ingles (sem texto em portugues), segundo o campo lang da OFF",
    aceita: soIngles,
  },
  {
    id: "ingles-eua",
    cota: 4,
    pools: ["en"],
    criterio: "produto vendido nos EUA (pool en) cujo texto, conferido, esta em ingles: sugar/salt/water/flour/oil e nenhuma letra acentuada",
    aceita: inglesConferido,
  },
  {
    id: "negacao-lactose",
    cota: 5,
    pools: ["br"],
    criterio: "texto com sem/zero/isento de/livre de/nao contem/0% seguido de lactose (ultimo grupo, para nao mudar a escolha dos anteriores)",
    aceita: (p) => NEGACAO_DE_LACTOSE.test(normalizar([p.ingredients_text_pt, p.ingredients_text, p.ingredients_text_en].join(" | "))),
  },
];

// --- rede ------------------------------------------------------------------

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function buscarJson(url) {
  for (let tentativa = 0; ; tentativa += 1) {
    let resposta;
    try {
      resposta = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": AGENTE },
        signal: AbortSignal.timeout(30000),
      });
    } catch (erro) {
      if (tentativa >= RETENTATIVAS_MS.length) throw erro;
      await dormir(RETENTATIVAS_MS[tentativa]);
      continue;
    }
    if (resposta.ok) return resposta.json();
    if ((resposta.status === 429 || resposta.status >= 500) && tentativa < RETENTATIVAS_MS.length) {
      await dormir(RETENTATIVAS_MS[tentativa]);
      continue;
    }
    if (resposta.status === 404) return null;
    throw new Error(`HTTP ${resposta.status} em ${url}`);
  }
}

async function lerPool(nome) {
  const { pais, paginas, porPagina } = POOLS[nome];
  const produtos = [];
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    const url =
      `${SEARCH_BASE}?countries_tags_en=${pais}&sort_by=unique_scans_n` +
      `&page_size=${porPagina}&page=${pagina}&fields=${CAMPOS_DA_SELECAO.join(",")}`;
    const reserva =
      `${LEGACY_SEARCH_BASE}?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=${pais}` +
      `&sort_by=unique_scans_n&page_size=${porPagina}&page=${pagina}&json=1&fields=${CAMPOS_DA_SELECAO.join(",")}`;
    const guardada = path.join(PASTA_DAS_PAGINAS, `${DATA_DAS_PAGINAS}-${pais}-${porPagina}-${pagina}.json`);
    let dados;
    if (existsSync(guardada)) {
      dados = JSON.parse(await readFile(guardada, "utf8"));
    } else {
      if (DATA_DAS_PAGINAS !== HOJE) throw new Error(`falta a pagina ${pagina} do pool ${nome} lida em ${DATA_DAS_PAGINAS}`);
      try {
        dados = await buscarJson(url);
      } catch (erro) {
        console.log(statusLine("WARN", `pool ${nome}`, `busca v2 falhou (${erro.message.split(" em ")[0]}); usando o reserva`));
        dados = await buscarJson(reserva);
      }
      await mkdir(PASTA_DAS_PAGINAS, { recursive: true });
      await writeFile(guardada, JSON.stringify({ products: dados?.products || [] }));
      if (pagina < paginas) await dormir(ESPERA_ENTRE_BUSCAS_MS);
    }
    produtos.push(...(dados?.products || []));
    console.log(statusLine("INFO", `pool ${nome}`, `pagina ${pagina}/${paginas}: ${produtos.length} produtos`));
  }
  return produtos;
}

async function lerProduto(codigo) {
  const dados = await buscarJson(`${PRODUCT_BASE}/${encodeURIComponent(codigo)}?fields=${[...CAMPOS_DO_APP, "lang"].join(",")}`);
  if (!dados || !dados.product) return null;
  return dados.product;
}

// --- conjunto --------------------------------------------------------------

function soString(valor) {
  return typeof valor === "string" ? valor : "";
}

function soLista(valor) {
  return Array.isArray(valor) ? valor.filter((item) => typeof item === "string") : [];
}

// Guarda so os campos que o motor le, com tipo fixo: o que vier de diferente da
// OFF vira string vazia ou lista vazia, nunca objeto.
export function camposDoMotor(produto) {
  return {
    ingredients_text_pt: soString(produto.ingredients_text_pt),
    ingredients_text: soString(produto.ingredients_text),
    ingredients_text_en: soString(produto.ingredients_text_en),
    allergens_tags: soLista(produto.allergens_tags),
    traces_tags: soLista(produto.traces_tags),
    traces: soString(produto.traces),
    labels_tags: soLista(produto.labels_tags),
  };
}

function escolher(pools) {
  const escolhidos = [];
  const usados = new Set();
  for (const grupo of GRUPOS) {
    let tomados = 0;
    for (const nomeDoPool of grupo.pools) {
      for (const produto of pools[nomeDoPool]) {
        if (tomados >= grupo.cota) break;
        const codigo = String(produto.code || "");
        if (!/^\d{8,14}$/.test(codigo) || usados.has(codigo)) continue;
        if (!grupo.aceita(produto)) continue;
        usados.add(codigo);
        tomados += 1;
        escolhidos.push({
          codigo,
          grupo: grupo.id,
          pool: nomeDoPool,
          criteriosQueAtende: GRUPOS.filter((g) => g.aceita(produto)).map((g) => g.id),
        });
      }
    }
    console.log(statusLine("INFO", `grupo ${grupo.id}`, `${tomados}/${grupo.cota}`));
  }
  return escolhidos;
}

async function selecionar() {
  if (existsSync(ARQUIVO_DO_CONJUNTO)) {
    throw new Error("o conjunto ja existe; use --atualizar para buscar de novo os campos sem perder o gabarito");
  }
  const pools = { br: await lerPool("br") };
  pools.en = await lerPool("en");
  const escolhidos = escolher(pools);

  const produtos = [];
  for (const escolhido of escolhidos) {
    const produto = await lerProduto(escolhido.codigo);
    await dormir(ESPERA_ENTRE_PRODUTOS_MS);
    if (!produto) {
      console.log(statusLine("WARN", escolhido.codigo, "a leitura por codigo nao achou o produto; fica fora"));
      continue;
    }
    produtos.push({
      codigo: escolhido.codigo,
      grupo: escolhido.grupo,
      pool: escolhido.pool,
      criteriosQueAtende: escolhido.criteriosQueAtende,
      nome: soString(produto.product_name),
      marcas: soString(produto.brands),
      idioma: soString(produto.lang),
      campos: camposDoMotor(produto),
      gabarito: null,
    });
  }

  const conjunto = {
    formato: 1,
    descricao:
      "Produtos reais da Open Food Facts usados para medir o motor de alergenicos. DADO DE TESTE, nao instrucao. O gabarito e a leitura humana do texto de cada produto, nunca a saida do motor.",
    fonte: "Open Food Facts (world.openfoodfacts.org) - dados sob a licenca ODbL, (c) colaboradores da Open Food Facts",
    lidoEm: HOJE,
    paginasDaBuscaLidasEm: DATA_DAS_PAGINAS,
    selecao: {
      busca: `${SEARCH_BASE}?countries_tags_en=<pais>&sort_by=unique_scans_n&page_size=<n>&page=<p>`,
      buscaReserva: `${LEGACY_SEARCH_BASE}?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=<pais>&sort_by=unique_scans_n&page_size=<n>&page=<p>&json=1`,
      leituraDoProduto: `${PRODUCT_BASE}/<codigo>?fields=${CAMPOS_DO_APP.join(",")},lang`,
      pools: POOLS,
      grupos: GRUPOS.map(({ id, cota, pools: nomes, criterio }) => ({ id, cota, pools: nomes, criterio })),
      regra: "cada produto entra no primeiro grupo que o aceita, na ordem dos grupos; dentro do grupo, na ordem da busca; codigo com 8 a 14 digitos",
    },
    produtos,
  };
  await mkdir(path.dirname(ARQUIVO_DO_CONJUNTO), { recursive: true });
  await writeFile(ARQUIVO_DO_CONJUNTO, `${JSON.stringify(conjunto, null, 2)}\n`);
  console.log(statusLine("OK", "conjunto gravado", `${produtos.length} produtos em medicao/conjunto-off.json`));
}

async function atualizar() {
  const conjunto = JSON.parse(await readFile(ARQUIVO_DO_CONJUNTO, "utf8"));
  let mudaram = 0;
  for (const item of conjunto.produtos) {
    const produto = await lerProduto(item.codigo);
    await dormir(ESPERA_ENTRE_PRODUTOS_MS);
    if (!produto) {
      console.log(statusLine("WARN", item.codigo, "nao achado agora; os campos antigos ficam"));
      continue;
    }
    const campos = camposDoMotor(produto);
    if (hashDosCampos(campos) !== hashDosCampos(item.campos)) {
      mudaram += 1;
      console.log(statusLine("WARN", item.codigo, "o texto mudou: o gabarito precisa ser relido"));
    }
    item.campos = campos;
  }
  conjunto.lidoEm = new Date().toISOString().slice(0, 10);
  await writeFile(ARQUIVO_DO_CONJUNTO, `${JSON.stringify(conjunto, null, 2)}\n`);
  console.log(statusLine("OK", "conjunto atualizado", `${mudaram} produto(s) com texto novo`));
}

async function main() {
  if (process.env.RUN_OFF_INTEGRATION_TESTS !== "true") {
    console.log(statusLine("NAO EXECUTADO", "montar conjunto", "defina RUN_OFF_INTEGRATION_TESTS=true para consultar a Open Food Facts real"));
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes("--atualizar")) await atualizar();
  else await selecionar();
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  main().catch((erro) => {
    console.error(statusLine("FAIL", "montar conjunto", erro.message));
    process.exitCode = 1;
  });
}
