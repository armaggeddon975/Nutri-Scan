import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeProductAllergens } from "../../shared/allergenEngine.js";

// MEDICAO DO MOTOR CONTRA PRODUTOS REAIS (v0.14.0)
//
// Mede `shared/allergenEngine.js` contra o conjunto guardado em
// `medicao/conjunto-off.json`: produtos reais da Open Food Facts, cada um com o
// gabarito escrito a partir da LEITURA do texto do rotulo.
//
// Tres regras sustentam a medicao:
//
//   1. O gabarito nao vem do motor. Ele esta gravado no conjunto, e cada
//      alergenico marcado como presente cita o trecho do texto que o prova
//      (`validarConjunto` confere que o trecho existe). Este modulo so LE o
//      gabarito; nada aqui escreve nele.
//   2. Sem rede. O conjunto e lido do disco; nenhuma chamada sai daqui. A rede
//      so e usada para montar o conjunto (scripts/montar-conjunto-off.js).
//   3. Ausencia de dado nao e erro. Produto sem nenhum dado para o motor
//      (`not_informed`) sai da conta e e reportado a parte.
//
// O texto dos produtos e dado de terceiro: ele so e comparado e impresso.

const pastaDoModulo = path.dirname(fileURLToPath(import.meta.url));
export const ARQUIVO_DO_CONJUNTO = path.resolve(pastaDoModulo, "../../medicao/conjunto-off.json");
export const ARQUIVO_DO_REGISTRO = path.resolve(pastaDoModulo, "../../medicao/resultado-registrado.json");

// Os 14 alergenicos regulados mais comuns que o catalogo do app tem com o mesmo
// id: os da lista europeia, que cobrem os da RDC 26/2015 da Anvisa (gluten,
// crustaceos, ovo, peixe, amendoim, soja, leite, castanhas) e mais gergelim,
// mostarda, aipo, tremoco, moluscos e sulfito.
export const ALERGENOS_MEDIDOS = [
  "milk",
  "gluten",
  "egg",
  "soy",
  "peanut",
  "nuts",
  "fish",
  "crustacean",
  "mollusc",
  "sesame",
  "mustard",
  "celery",
  "lupin",
  "sulphite",
];

export const NOME_DO_ALERGENO = {
  milk: "leite",
  gluten: "gluten",
  egg: "ovo",
  soy: "soja",
  peanut: "amendoim",
  nuts: "castanhas",
  fish: "peixe",
  crustacean: "crustaceos",
  mollusc: "moluscos",
  sesame: "gergelim",
  mustard: "mostarda",
  celery: "aipo",
  lupin: "tremoco",
  sulphite: "sulfito",
};

// Os campos que o motor le e que o app busca na OFF
// (src/services/openFoodFactsService.js e shared/productAllergenAdapter.js).
export const CAMPOS_DO_MOTOR = [
  "ingredients_text_pt",
  "ingredients_text",
  "ingredients_text_en",
  "allergens_tags",
  "traces_tags",
  "traces",
  "labels_tags",
];
const CAMPOS_DE_TEXTO = ["ingredients_text_pt", "ingredients_text", "ingredients_text_en"];
const CAMPOS_DE_LISTA = ["allergens_tags", "traces_tags", "labels_tags"];

export const MODOS = {
  // O que o app faz: o produto inteiro, com as tags que a propria OFF calcula.
  PIPELINE: "pipeline",
  // So o texto: sem allergens_tags, traces_tags, traces e labels_tags. Mede a
  // leitura do texto pelo motor, sem a ajuda das tags da OFF.
  SO_TEXTO: "so-texto",
};

export const ESPERADO = { CONTEM: "contem", TRACO: "traco", AUSENTE: "ausente" };

// Taxonomia da OFF para cada alergenico medido. Usada SO para listar onde as tags
// da OFF discordam do texto - nunca para formar o gabarito.
const TAG_DA_OFF = {
  milk: "en:milk",
  gluten: "en:gluten",
  egg: "en:eggs",
  soy: "en:soybeans",
  peanut: "en:peanuts",
  nuts: "en:nuts",
  fish: "en:fish",
  crustacean: "en:crustaceans",
  mollusc: "en:molluscs",
  sesame: "en:sesame-seeds",
  mustard: "en:mustard",
  celery: "en:celery",
  lupin: "en:lupin",
  sulphite: "en:sulphur-dioxide-and-sulphites",
};

// Normalizacao propria da medicao, para conferir trecho contra texto: sem
// acento, minuscula, espacos colapsados. Nao reaproveita nada do motor.
export function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function hashDosCampos(campos) {
  const canonico = Object.fromEntries(CAMPOS_DO_MOTOR.map((campo) => [campo, campos?.[campo]]));
  return createHash("sha256").update(JSON.stringify(canonico)).digest("hex");
}

export function textoDoProduto(campos) {
  return CAMPOS_DE_TEXTO.map((campo) => campos[campo] || "").join("\n");
}

// --- conjunto --------------------------------------------------------------

function ehObjetoSimples(valor) {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}

function conferirTrechos(problemas, codigo, rotulo, mapa, texto) {
  if (!ehObjetoSimples(mapa)) {
    problemas.push(`${codigo}: gabarito.${rotulo} precisa ser um objeto`);
    return;
  }
  for (const [alergeno, trecho] of Object.entries(mapa)) {
    if (!ALERGENOS_MEDIDOS.includes(alergeno)) problemas.push(`${codigo}: ${rotulo} com alergenico fora da medicao: ${alergeno}`);
    if (typeof trecho !== "string" || !normalizar(trecho)) {
      problemas.push(`${codigo}: ${rotulo}.${alergeno} sem trecho do rotulo`);
    } else if (!texto.includes(normalizar(trecho))) {
      problemas.push(`${codigo}: ${rotulo}.${alergeno} cita um trecho que nao esta no texto: "${trecho}"`);
    }
  }
}

// Recusa o conjunto inteiro se qualquer produto estiver fora do formato. Uma
// medicao sobre conjunto torto nao mede nada.
export function validarConjunto(conjunto) {
  const problemas = [];
  if (!ehObjetoSimples(conjunto) || conjunto.formato !== 1) throw new Error("conjunto: formato desconhecido");
  if (!Array.isArray(conjunto.produtos) || conjunto.produtos.length === 0) throw new Error("conjunto: sem produtos");

  const codigos = new Set();
  for (const produto of conjunto.produtos) {
    const codigo = produto?.codigo;
    if (typeof codigo !== "string" || !/^\d{8,14}$/.test(codigo)) {
      problemas.push(`codigo invalido: ${JSON.stringify(codigo)}`);
      continue;
    }
    if (codigos.has(codigo)) problemas.push(`${codigo}: repetido`);
    codigos.add(codigo);

    const campos = produto.campos;
    if (!ehObjetoSimples(campos)) {
      problemas.push(`${codigo}: sem campos`);
      continue;
    }
    const chaves = Object.keys(campos).sort();
    if (JSON.stringify(chaves) !== JSON.stringify([...CAMPOS_DO_MOTOR].sort())) {
      problemas.push(`${codigo}: campos diferentes dos que o motor le: ${chaves.join(",")}`);
    }
    for (const campo of [...CAMPOS_DE_TEXTO, "traces"]) {
      if (typeof campos[campo] !== "string") problemas.push(`${codigo}: ${campo} precisa ser texto`);
    }
    for (const campo of CAMPOS_DE_LISTA) {
      if (!Array.isArray(campos[campo]) || !campos[campo].every((item) => typeof item === "string")) {
        problemas.push(`${codigo}: ${campo} precisa ser lista de texto`);
      }
    }

    const gabarito = produto.gabarito;
    if (!ehObjetoSimples(gabarito)) {
      problemas.push(`${codigo}: sem gabarito`);
      continue;
    }
    if (gabarito.conferidoContra !== hashDosCampos(campos)) {
      problemas.push(`${codigo}: o texto mudou depois que o gabarito foi escrito; releia o rotulo`);
    }
    const texto = normalizar(textoDoProduto(campos));
    const semTexto = texto === "";
    if (gabarito.semTexto !== semTexto) problemas.push(`${codigo}: semTexto deveria ser ${semTexto}`);
    conferirTrechos(problemas, codigo, "contem", gabarito.contem, texto);
    conferirTrechos(problemas, codigo, "traco", gabarito.traco, texto);
    if (ehObjetoSimples(gabarito.contem) && ehObjetoSimples(gabarito.traco)) {
      for (const alergeno of Object.keys(gabarito.traco)) {
        if (alergeno in gabarito.contem) problemas.push(`${codigo}: ${alergeno} em contem e em traco`);
      }
    }
    if (!Array.isArray(gabarito.negacoes)) {
      problemas.push(`${codigo}: gabarito.negacoes precisa ser uma lista`);
    } else {
      const vistos = new Set();
      for (const negacao of gabarito.negacoes) {
        if (!ALERGENOS_MEDIDOS.includes(negacao?.alergeno)) problemas.push(`${codigo}: negacao com alergenico fora da medicao`);
        if (vistos.has(negacao?.alergeno)) problemas.push(`${codigo}: negacao repetida para ${negacao?.alergeno}`);
        vistos.add(negacao?.alergeno);
        if (typeof negacao?.trecho !== "string" || !texto.includes(normalizar(negacao.trecho)) || !normalizar(negacao.trecho)) {
          problemas.push(`${codigo}: negacao de ${negacao?.alergeno} cita um trecho que nao esta no texto`);
        }
      }
    }
    if (semTexto && (Object.keys(gabarito.contem || {}).length || Object.keys(gabarito.traco || {}).length)) {
      problemas.push(`${codigo}: produto sem texto nao pode ter alergenico no gabarito`);
    }
  }

  if (problemas.length) throw new Error(`conjunto recusado:\n- ${problemas.join("\n- ")}`);
  return conjunto;
}

export function carregarConjunto(arquivo = ARQUIVO_DO_CONJUNTO) {
  return validarConjunto(JSON.parse(readFileSync(arquivo, "utf8")));
}

export function carregarRegistro(arquivo = ARQUIVO_DO_REGISTRO) {
  return JSON.parse(readFileSync(arquivo, "utf8"));
}

// --- medicao ---------------------------------------------------------------

export function esperadoDoGabarito(gabarito, alergeno) {
  if (alergeno in gabarito.contem) return ESPERADO.CONTEM;
  if (alergeno in gabarito.traco) return ESPERADO.TRACO;
  return ESPERADO.AUSENTE;
}

export function entradaDoMotor(campos, modo) {
  const entrada = { ...campos };
  if (modo === MODOS.SO_TEXTO) {
    entrada.allergens_tags = [];
    entrada.traces_tags = [];
    entrada.traces = "";
    entrada.labels_tags = [];
  }
  return entrada;
}

export function lerMotor(produto, modo, motor = analyzeProductAllergens) {
  const analise = motor(entradaDoMotor(produto.campos, modo), ALERGENOS_MEDIDOS);
  const porAlergeno = {};
  for (const alergeno of ALERGENOS_MEDIDOS) {
    const risco = (analise?.profileRisks || []).find((item) => item.id === alergeno);
    porAlergeno[alergeno] = risco ? risco.severity : null;
  }
  return { temDado: Boolean(analise?.hasData), porAlergeno };
}

const CORRESPONDE = { [ESPERADO.CONTEM]: "contains", [ESPERADO.TRACO]: "traces", [ESPERADO.AUSENTE]: null };

function contagemVazia() {
  return {
    pares: 0,
    contemNoGabarito: 0,
    tracoNoGabarito: 0,
    acertoPositivo: 0,
    falsoNegativo: 0,
    falsoPositivo: 0,
    acertoNegativo: 0,
    declaradoComoTraco: 0,
    tracoComoDeclarado: 0,
  };
}

export function medir(conjunto, { modo = MODOS.PIPELINE, motor = analyzeProductAllergens } = {}) {
  const resultado = {
    modo,
    produtos: conjunto.produtos.length,
    paresMedidos: 0,
    porAlergeno: Object.fromEntries(ALERGENOS_MEDIDOS.map((alergeno) => [alergeno, contagemVazia()])),
    total: contagemVazia(),
    casos: { falsosNegativos: [], declaradoComoTraco: [], falsosPositivos: [], tracoComoDeclarado: [] },
    negacao: { casos: 0, certos: 0, lista: [] },
    naoInformado: [],
    semTextoParaGabarito: [],
  };

  for (const produto of conjunto.produtos) {
    const leitura = lerMotor(produto, modo, motor);
    if (!leitura.temDado) {
      resultado.naoInformado.push(produto.codigo);
      continue;
    }
    if (produto.gabarito.semTexto) {
      const apontados = ALERGENOS_MEDIDOS.filter((alergeno) => leitura.porAlergeno[alergeno]).map(
        (alergeno) => `${alergeno}:${leitura.porAlergeno[alergeno]}`,
      );
      resultado.semTextoParaGabarito.push({ codigo: produto.codigo, motor: apontados });
      continue;
    }

    for (const alergeno of ALERGENOS_MEDIDOS) {
      const esperado = esperadoDoGabarito(produto.gabarito, alergeno);
      const doMotor = leitura.porAlergeno[alergeno];
      const contagens = [resultado.porAlergeno[alergeno], resultado.total];
      const caso = {
        caso: `${produto.codigo}:${alergeno}`,
        codigo: produto.codigo,
        alergeno,
        esperado,
        motor: doMotor ?? "-",
        trecho: produto.gabarito.contem[alergeno] || produto.gabarito.traco[alergeno] || "",
      };
      const noRotulo = esperado !== ESPERADO.AUSENTE;
      const aponta = doMotor !== null;
      for (const contagem of contagens) {
        contagem.pares += 1;
        if (esperado === ESPERADO.CONTEM) contagem.contemNoGabarito += 1;
        if (esperado === ESPERADO.TRACO) contagem.tracoNoGabarito += 1;
        if (noRotulo && aponta) contagem.acertoPositivo += 1;
        if (noRotulo && !aponta) contagem.falsoNegativo += 1;
        if (!noRotulo && aponta) contagem.falsoPositivo += 1;
        if (!noRotulo && !aponta) contagem.acertoNegativo += 1;
        if (esperado === ESPERADO.CONTEM && doMotor === "traces") contagem.declaradoComoTraco += 1;
        if (esperado === ESPERADO.TRACO && doMotor === "contains") contagem.tracoComoDeclarado += 1;
      }
      resultado.paresMedidos += 1;
      if (noRotulo && !aponta) resultado.casos.falsosNegativos.push(caso);
      if (!noRotulo && aponta) resultado.casos.falsosPositivos.push(caso);
      if (esperado === ESPERADO.CONTEM && doMotor === "traces") resultado.casos.declaradoComoTraco.push(caso);
      if (esperado === ESPERADO.TRACO && doMotor === "contains") resultado.casos.tracoComoDeclarado.push(caso);
    }

    for (const negacao of produto.gabarito.negacoes) {
      const esperado = esperadoDoGabarito(produto.gabarito, negacao.alergeno);
      const doMotor = leitura.porAlergeno[negacao.alergeno];
      const certo = CORRESPONDE[esperado] === doMotor;
      resultado.negacao.casos += 1;
      if (certo) resultado.negacao.certos += 1;
      resultado.negacao.lista.push({
        caso: `${produto.codigo}:${negacao.alergeno}`,
        trecho: negacao.trecho,
        esperado,
        motor: doMotor ?? "-",
        certo,
      });
    }
  }
  return resultado;
}

// Onde as tags que a propria OFF calculou discordam da leitura do texto. Nao
// entra no numero do motor: e o caso interessante que o prompt manda registrar.
export function discordanciasTagTexto(conjunto) {
  const discordancias = [];
  for (const produto of conjunto.produtos) {
    if (produto.gabarito.semTexto) continue;
    for (const alergeno of ALERGENOS_MEDIDOS) {
      const tag = TAG_DA_OFF[alergeno];
      const pelaTag = produto.campos.allergens_tags.includes(tag)
        ? ESPERADO.CONTEM
        : produto.campos.traces_tags.includes(tag)
          ? ESPERADO.TRACO
          : ESPERADO.AUSENTE;
      const peloTexto = esperadoDoGabarito(produto.gabarito, alergeno);
      if (pelaTag !== peloTexto) {
        discordancias.push({ caso: `${produto.codigo}:${alergeno}`, codigo: produto.codigo, alergeno, tag: pelaTag, texto: peloTexto });
      }
    }
  }
  return discordancias;
}

// --- regressao -------------------------------------------------------------

// O registro guarda, por modo, a LISTA de casos de cada tipo de erro. A conta
// falha se:
//   - um tipo de erro passar do numero registrado (o limite);
//   - aparecer um caso que nao esta no registro (troca de um erro por outro com
//     o mesmo total tambem e pega);
//   - um caso registrado deixar de acontecer (o ganho precisa ser travado no
//     registro, senao o erro pode voltar sem ninguem ver).
export const LISTAS_GRAVES = ["falsosNegativos", "declaradoComoTraco"];
export const LISTAS_DE_FALSO_POSITIVO = ["falsosPositivos", "tracoComoDeclarado"];

export function conferirRegistro(resultado, registroDoModo) {
  const problemas = [];
  for (const lista of [...LISTAS_GRAVES, ...LISTAS_DE_FALSO_POSITIVO]) {
    const atual = resultado.casos[lista].map((caso) => caso.caso);
    const registrado = registroDoModo?.[lista];
    if (!Array.isArray(registrado)) {
      problemas.push({ tipo: "registro-ausente", modo: resultado.modo, lista });
      continue;
    }
    if (atual.length > registrado.length) {
      problemas.push({ tipo: "acima-do-registrado", modo: resultado.modo, lista, atual: atual.length, registrado: registrado.length });
    }
    for (const caso of atual) {
      if (!registrado.includes(caso)) problemas.push({ tipo: "caso-novo", modo: resultado.modo, lista, caso });
    }
    for (const caso of registrado) {
      if (!atual.includes(caso)) problemas.push({ tipo: "registro-desatualizado", modo: resultado.modo, lista, caso });
    }
  }
  return problemas;
}

export function descreverProblema(problema) {
  const onde = `[${problema.modo}] ${problema.lista}`;
  if (problema.tipo === "acima-do-registrado") return `${onde}: ${problema.atual} casos, acima dos ${problema.registrado} registrados`;
  if (problema.tipo === "caso-novo") return `${onde}: caso novo ${problema.caso}`;
  if (problema.tipo === "registro-desatualizado") return `${onde}: ${problema.caso} deixou de acontecer; atualize o registro para travar o ganho`;
  return `${onde}: sem lista no registro`;
}

// --- relatorio -------------------------------------------------------------

const largura = (valor, n) => String(valor).padStart(n);

function tabela(resultado) {
  const linhas = [
    "alergenico   pares  no rotulo (contem+traco)  acerto+  FALSO-  falso+  acerto-   contem->traco  traco->contem",
  ];
  const linha = (nome, c) =>
    `${nome.padEnd(11)} ${largura(c.pares, 6)}  ${largura(c.contemNoGabarito + c.tracoNoGabarito, 9)} (${c.contemNoGabarito}+${c.tracoNoGabarito})`.padEnd(
      44,
    ) +
    `${largura(c.acertoPositivo, 7)} ${largura(c.falsoNegativo, 7)} ${largura(c.falsoPositivo, 7)} ${largura(c.acertoNegativo, 8)} ${largura(c.declaradoComoTraco, 15)} ${largura(c.tracoComoDeclarado, 14)}`;
  for (const alergeno of ALERGENOS_MEDIDOS) linhas.push(linha(NOME_DO_ALERGENO[alergeno], resultado.porAlergeno[alergeno]));
  linhas.push(linha("TOTAL", resultado.total));
  return linhas.join("\n");
}

function listaDeCasos(titulo, casos) {
  if (!casos.length) return `${titulo}: 0`;
  return [
    `${titulo}: ${casos.length}`,
    ...casos.map(
      (caso) => `  ${caso.codigo.padEnd(14)} ${NOME_DO_ALERGENO[caso.alergeno].padEnd(11)} gabarito ${caso.esperado.padEnd(8)} motor ${String(caso.motor).padEnd(9)}${caso.trecho ? ` "${caso.trecho}"` : ""}`,
    ),
  ].join("\n");
}

export function formatarModo(resultado) {
  const t = resultado.total;
  return [
    `== modo ${resultado.modo} ==`,
    `pares medidos: ${resultado.paresMedidos} | produtos sem dado para o motor (not_informed): ${resultado.naoInformado.length} | produtos sem texto para o gabarito: ${resultado.semTextoParaGabarito.length}`,
    "",
    tabela(resultado),
    "",
    `ERROS GRAVES: ${t.falsoNegativo} falso(s) negativo(s) + ${t.declaradoComoTraco} declarado(s) lido(s) como traco`,
    listaDeCasos("falsos negativos (no rotulo, o motor nao aponta)", resultado.casos.falsosNegativos),
    listaDeCasos("declarado classificado como traco (falso negativo parcial, grave)", resultado.casos.declaradoComoTraco),
    listaDeCasos("falsos positivos (fora do rotulo, o motor aponta)", resultado.casos.falsosPositivos),
    listaDeCasos("traco classificado como declarado (falso positivo)", resultado.casos.tracoComoDeclarado),
    "",
    `negacao: ${resultado.negacao.casos} casos, ${resultado.negacao.certos} tratados certo`,
    ...resultado.negacao.lista.map(
      (n) => `  ${n.certo ? "certo " : "ERRADO"} ${n.caso.padEnd(24)} "${n.trecho}" gabarito ${n.esperado} motor ${n.motor}`,
    ),
    "",
    `not_informed (fora da conta, nao e erro): ${resultado.naoInformado.length ? resultado.naoInformado.join(", ") : "nenhum"}`,
    `sem texto para o gabarito (fora da conta): ${
      resultado.semTextoParaGabarito.length
        ? resultado.semTextoParaGabarito.map((p) => `${p.codigo} [motor: ${p.motor.join(" ") || "nada"}]`).join(", ")
        : "nenhum"
    }`,
  ].join("\n");
}

export function formatarRelatorio(conjunto, resultados, { motorSha256 } = {}) {
  const grupos = {};
  for (const produto of conjunto.produtos) grupos[produto.grupo] = (grupos[produto.grupo] || 0) + 1;
  const discordancias = discordanciasTagTexto(conjunto);
  return [
    "MEDICAO DO MOTOR CONTRA PRODUTOS REAIS",
    "Medicao de software contra rotulos. NAO e validacao clinica.",
    `conjunto: ${conjunto.produtos.length} produtos da Open Food Facts (paginas de busca de ${conjunto.paginasDaBuscaLidasEm}, produtos lidos em ${conjunto.lidoEm})`,
    `grupos: ${Object.entries(grupos).map(([grupo, n]) => `${grupo} ${n}`).join(", ")}`,
    `alergenicos medidos: ${ALERGENOS_MEDIDOS.length} (${ALERGENOS_MEDIDOS.map((a) => NOME_DO_ALERGENO[a]).join(", ")})`,
    motorSha256 ? `motor: shared/allergenEngine.js sha256 ${motorSha256} (fim de linha LF)` : null,
    "",
    ...resultados.flatMap((resultado) => [formatarModo(resultado), ""]),
    `discordancias tag da OFF x texto (registradas, fora da conta): ${discordancias.length}`,
    ...discordancias.map(
      (d) => `  ${d.codigo.padEnd(14)} ${NOME_DO_ALERGENO[d.alergeno].padEnd(11)} tag ${d.tag.padEnd(8)} texto ${d.texto}`,
    ),
  ]
    .filter((linha) => linha !== null)
    .join("\n");
}
