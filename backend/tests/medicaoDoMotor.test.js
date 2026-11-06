import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { IDBFactory } from "fake-indexeddb";

import { createApp } from "../src/app.js";
import { answerAssistantChat } from "../src/ai/assistantService.js";
import { buildAssistantContext } from "../src/ai/contextBuilder.js";
import { criarLimitadoresDeComparacao, TETO_COMPARACAO_POR_IP, TETO_COMPARACAO_POR_USUARIO } from "../src/middleware/rateLimit.js";
import { amarrarExplicacoes } from "../src/services/comparisonService.js";
import { analyzeProductAllergens } from "../../shared/allergenEngine.js";
import { VALID_ALLERGY_IDS } from "../../shared/allergens.js";
import { buildAllergyVerdict } from "../../shared/allergyVerdict.js";
import { validarCodigoDeBarras } from "../../shared/barcode.js";
import { compareProducts } from "../../shared/productComparison.js";
import {
  ALERGENOS_MEDIDOS,
  ARQUIVO_DO_CONJUNTO,
  ARQUIVO_DO_REGISTRO,
  carregarConjunto,
  carregarRegistro,
  conferirRegistro,
  ESPERADO,
  formatarModo,
  formatarRelatorio,
  hashDosCampos,
  medir,
  MODOS,
  validarConjunto,
} from "../../scripts/lib/medicaoDoMotor.js";
import { criarCacheOffline } from "../../src/services/offlineCache.js";
import { avaliarNoAparelho, consultarNoAparelho, guardarProdutoVisto } from "../../src/services/offlineLookup.js";
import { aoConfirmarConta, aoSairDaConta } from "../../src/services/offlineSession.js";
import { DO_SHELL, estrategiaPara, IGNORAR, podeGuardar } from "../../src/sw/politicaDeCache.js";

// MEDICAO DO MOTOR CONTRA PRODUTOS REAIS (v0.14.0)
//
// M1..M10: a medicao em si - conjunto, nao circularidade, rede, as quatro
// saidas, traco, negacao, not_informed, regressao, correcoes e credencial.
// R1..R10: regressao do que as versoes anteriores provaram, pelo codigo real.

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const backendDir = path.join(rootDir, "backend");

// O tamanho declarado no AUDIT_REPORT e em docs/MEDICAO_DO_MOTOR.md.
const TAMANHO_DECLARADO = 71;
const GRUPOS_DECLARADOS = {
  tipico: 15,
  negacao: 10,
  traco: 10,
  "dentro-de-outro": 8,
  grafia: 8,
  vazio: 5,
  "so-ingles": 6,
  "ingles-eua": 4,
  "negacao-lactose": 5,
};
const PARES_CONTEM = 107;
const PARES_TRACO = 37;
const PRODUTOS_SEM_TEXTO = ["7622210596413", "7896004006277", "07117815", "7891008116632", "7896004006239"];
const PARES_MEDIDOS = (TAMANHO_DECLARADO - PRODUTOS_SEM_TEXTO.length) * ALERGENOS_MEDIDOS.length;

const conjunto = carregarConjunto();
const registro = carregarRegistro();
const produtoDoConjunto = (codigo) => {
  const produto = conjunto.produtos.find((item) => item.codigo === codigo);
  assert.ok(produto, `o produto ${codigo} nao esta no conjunto`);
  return produto;
};
const clonar = (valor) => JSON.parse(JSON.stringify(valor));

// Motores de mentira, para provar o que a medicao conta. Cada um recebe o mesmo
// produto que o motor real receberia.
const motorNulo = () => ({ allRisks: [], profileRisks: [], hasData: true });
const motorTotal = (_produto, selecionadas) => ({
  allRisks: [],
  profileRisks: selecionadas.map((id) => ({ id, severity: "contains" })),
  hasData: true,
});
const motorSemDado = () => ({ allRisks: [], profileRisks: [], hasData: false });

// O motor real, com um ajuste so no produto `codigo`.
function motorAlterado(codigo, ajustar) {
  const alvo = produtoDoConjunto(codigo).campos;
  return (entrada, selecionadas) => {
    const analise = analyzeProductAllergens(entrada, selecionadas);
    const ehOAlvo = entrada.ingredients_text_pt === alvo.ingredients_text_pt && entrada.ingredients_text === alvo.ingredients_text;
    return ehOAlvo ? { ...analise, profileRisks: ajustar(analise.profileRisks) } : analise;
  };
}

// ---------------------------------------------------------------------------
// M1..M10
// ---------------------------------------------------------------------------

test("M1 o conjunto carrega e tem o tamanho declarado: 71 produtos, os grupos e o gabarito de cada um", () => {
  assert.equal(conjunto.produtos.length, TAMANHO_DECLARADO);
  const grupos = {};
  for (const produto of conjunto.produtos) grupos[produto.grupo] = (grupos[produto.grupo] || 0) + 1;
  assert.deepEqual(grupos, GRUPOS_DECLARADOS);
  assert.equal(registro.produtos, TAMANHO_DECLARADO, "o registro foi feito sobre outro conjunto");
  const contar = (chave) => conjunto.produtos.reduce((soma, p) => soma + Object.keys(p.gabarito[chave]).length, 0);
  assert.equal(contar("contem"), PARES_CONTEM);
  assert.equal(contar("traco"), PARES_TRACO);
  assert.deepEqual(conjunto.produtos.filter((p) => p.gabarito.semTexto).map((p) => p.codigo), PRODUTOS_SEM_TEXTO);
  assert.equal(ALERGENOS_MEDIDOS.length, 14);
  for (const alergeno of ALERGENOS_MEDIDOS) assert.ok(new Set(VALID_ALLERGY_IDS).has(alergeno), `${alergeno} nao e id do catalogo`);
  // Brasileiros de verdade: a maioria do conjunto tem texto em portugues.
  assert.ok(conjunto.produtos.filter((p) => p.campos.ingredients_text_pt.trim()).length >= 50);

  // A carga recusa conjunto torto, em vez de medir sobre ele.
  const semGabarito = clonar(conjunto);
  semGabarito.produtos[0].gabarito = null;
  assert.throws(() => validarConjunto(semGabarito), /sem gabarito/);
  const textoMudou = clonar(conjunto);
  textoMudou.produtos[1].campos.ingredients_text_pt += " leite";
  assert.throws(() => validarConjunto(textoMudou), /o texto mudou depois que o gabarito foi escrito/);
});

test("M2 o gabarito NAO vem do motor: cada positivo cita o rotulo, e a conta muda com o motor e nao com o gabarito", () => {
  // (a) Cada alergenico do gabarito cita um trecho que existe no texto - e um
  //     trecho inventado faz o conjunto ser recusado.
  const inventado = clonar(conjunto);
  const fanta = inventado.produtos.find((p) => p.codigo === "5449000335906");
  fanta.gabarito.contem.milk = "leite em po integral";
  assert.throws(() => validarConjunto(inventado), /5449000335906: contem.milk cita um trecho que nao esta no texto/);

  // (b) A conta depende do motor; o gabarito, nao. Um motor que nunca aponta
  //     nada tem falso negativo em TODOS os positivos do gabarito; um que aponta
  //     tudo tem falso positivo em todos os ausentes. Se o gabarito viesse da
  //     saida do motor, o motor nulo teria zero falso negativo.
  const antes = clonar(conjunto.produtos.map((p) => p.gabarito));
  const nulo = medir(conjunto, { motor: motorNulo });
  const total = medir(conjunto, { motor: motorTotal });
  const real = medir(conjunto);
  assert.equal(nulo.total.falsoNegativo, PARES_CONTEM + PARES_TRACO);
  assert.equal(nulo.total.acertoPositivo, 0);
  assert.equal(nulo.total.falsoPositivo, 0);
  assert.equal(total.total.falsoPositivo, PARES_MEDIDOS - PARES_CONTEM - PARES_TRACO);
  assert.equal(total.total.falsoNegativo, 0);
  assert.equal(total.total.tracoComoDeclarado, PARES_TRACO);
  for (const resultado of [nulo, total, real]) {
    assert.equal(resultado.total.contemNoGabarito, PARES_CONTEM, `gabarito mudou com o motor (${resultado.modo})`);
    assert.equal(resultado.total.tracoNoGabarito, PARES_TRACO);
  }
  // (c) Medir nao escreve no gabarito.
  assert.deepEqual(conjunto.produtos.map((p) => p.gabarito), antes);
});

test("M3 a medicao roda sem rede: fetch, http, https, net, tls e dns bloqueados e o comando sai com 0", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "nutriscan-sem-rede-"));
  const bloqueio = path.join(pasta, "bloqueio.mjs");
  writeFileSync(
    bloqueio,
    `
      import dns from "node:dns";
      import http from "node:http";
      import https from "node:https";
      import net from "node:net";
      import tls from "node:tls";
      const bloquear = (nome) => () => { process.stderr.write("REDE BLOQUEADA: " + nome + "\\n"); throw new Error("rede bloqueada: " + nome); };
      globalThis.fetch = bloquear("fetch");
      http.request = bloquear("http.request"); http.get = bloquear("http.get");
      https.request = bloquear("https.request"); https.get = bloquear("https.get");
      net.connect = bloquear("net.connect"); net.createConnection = bloquear("net.createConnection");
      net.Socket.prototype.connect = bloquear("net.Socket.connect");
      tls.connect = bloquear("tls.connect");
      dns.lookup = bloquear("dns.lookup"); dns.promises.lookup = bloquear("dns.promises.lookup");
    `,
  );
  try {
    const importar = ["--import", pathToFileURL(bloqueio).href];
    // O bloqueio funciona: uma chamada de rede com ele falha.
    const controle = spawnSync(process.execPath, [...importar, "-e", "fetch('https://example.test')"], { encoding: "utf8" });
    assert.notEqual(controle.status, 0);
    assert.match(controle.stderr, /REDE BLOQUEADA: fetch/);

    const medicao = spawnSync(process.execPath, [...importar, "scripts/medir-motor.js", "--conferir"], { cwd: rootDir, encoding: "utf8" });
    assert.equal(medicao.status, 0, medicao.stderr);
    assert.doesNotMatch(medicao.stderr, /REDE BLOQUEADA/);
    assert.match(medicao.stdout, /\[OK\] medicao do motor - igual ao registrado/);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
  // E nem tenta: a medicao nao importa modulo de rede nem o script que monta o
  // conjunto (o unico que fala com a OFF).
  for (const arquivo of ["scripts/lib/medicaoDoMotor.js", "scripts/medir-motor.js"]) {
    const fonte = readFileSync(path.join(rootDir, arquivo), "utf8");
    assert.doesNotMatch(fonte, /from "node:(http|https|net|tls|dns)"|\bfetch\(|from "[^"]*montar-conjunto-off/, arquivo);
  }
});

test("M4 a medicao reporta as quatro saidas por alergenico, e elas somam os pares medidos", () => {
  for (const modo of [MODOS.PIPELINE, MODOS.SO_TEXTO]) {
    const resultado = medir(conjunto, { modo });
    assert.equal(resultado.paresMedidos, PARES_MEDIDOS);
    assert.deepEqual(Object.keys(resultado.porAlergeno), ALERGENOS_MEDIDOS);
    for (const alergeno of ALERGENOS_MEDIDOS) {
      const c = resultado.porAlergeno[alergeno];
      assert.equal(c.pares, TAMANHO_DECLARADO - PRODUTOS_SEM_TEXTO.length, alergeno);
      assert.equal(c.acertoPositivo + c.falsoNegativo + c.falsoPositivo + c.acertoNegativo, c.pares, alergeno);
      assert.equal(c.acertoPositivo + c.falsoNegativo, c.contemNoGabarito + c.tracoNoGabarito, alergeno);
    }
    const relatorio = formatarModo(resultado);
    assert.match(relatorio, /acerto\+ +FALSO- +falso\+ +acerto-/);
    for (const nome of ["leite", "gluten", "ovo", "soja", "amendoim", "castanhas", "peixe", "crustaceos", "moluscos", "gergelim", "mostarda", "aipo", "tremoco", "sulfito", "TOTAL"]) {
      assert.match(relatorio, new RegExp(`^${nome} +\\d+`, "m"), nome);
    }
  }
});

test("M5 traco e declarado sao contados separadamente: declarado->traco e traco->declarado", () => {
  const real = medir(conjunto);
  assert.equal(real.total.contemNoGabarito, PARES_CONTEM);
  assert.equal(real.total.tracoNoGabarito, PARES_TRACO);
  assert.equal(real.total.declaradoComoTraco, 0);
  const contemApontados = PARES_CONTEM - real.casos.falsosNegativos.filter((c) => c.esperado === ESPERADO.CONTEM).length;
  const tracoApontados = PARES_TRACO - real.casos.falsosNegativos.filter((c) => c.esperado === ESPERADO.TRACO).length;

  // Rebaixando todo "contains" a "traces": cada declarado apontado vira um
  // falso negativo parcial, e o binario (aponta / nao aponta) nao muda.
  const rebaixa = (entrada, sel) => {
    const a = analyzeProductAllergens(entrada, sel);
    return { ...a, profileRisks: a.profileRisks.map((r) => ({ ...r, severity: "traces" })) };
  };
  const rebaixado = medir(conjunto, { motor: rebaixa });
  assert.equal(rebaixado.total.declaradoComoTraco, contemApontados);
  assert.equal(rebaixado.casos.declaradoComoTraco.length, contemApontados);
  assert.equal(rebaixado.total.falsoNegativo, real.total.falsoNegativo);
  // Promovendo todo "traces" a "contains": cada traco apontado vira falso positivo de severidade.
  const promove = (entrada, sel) => {
    const a = analyzeProductAllergens(entrada, sel);
    return { ...a, profileRisks: a.profileRisks.map((r) => ({ ...r, severity: "contains" })) };
  };
  assert.equal(medir(conjunto, { motor: promove }).total.tracoComoDeclarado, tracoApontados);
  const relatorio = formatarModo(rebaixado);
  assert.match(relatorio, new RegExp(`declarado classificado como traco \\(falso negativo parcial, grave\\): ${contemApontados}`));
  assert.match(relatorio, /traco classificado como declarado \(falso positivo\): \d+/);
});

test("M6 os casos de negacao sao contados e reportados: 22 (17 de gluten, 5 de lactose), com leite sem lactose ainda leite", () => {
  for (const modo of [MODOS.PIPELINE, MODOS.SO_TEXTO]) {
    const resultado = medir(conjunto, { modo });
    assert.equal(resultado.negacao.casos, 22);
    assert.equal(resultado.negacao.lista.filter((n) => n.caso.endsWith(":gluten")).length, 17);
    assert.equal(resultado.negacao.lista.filter((n) => n.caso.endsWith(":milk")).length, 5);
    assert.equal(resultado.negacao.certos, 22, `${modo}: ${JSON.stringify(resultado.negacao.lista.filter((n) => !n.certo))}`);
    assert.match(formatarModo(resultado), /negacao: 22 casos, 22 tratados certo/);
  }
  // Leite sem lactose: a negacao e da lactose, o leite continua no rotulo.
  const semLactose = medir(conjunto).negacao.lista.filter((n) => n.esperado === ESPERADO.CONTEM).map((n) => n.caso);
  assert.deepEqual(semLactose, ["7893000502888:milk", "7892999150124:milk"]);
  // Um motor que ignora a negacao do gluten erra exatamente os 17 casos de gluten.
  const ignoraGluten = (entrada, sel) => {
    const a = analyzeProductAllergens(entrada, sel);
    return { ...a, profileRisks: [...a.profileRisks.filter((r) => r.id !== "gluten"), { id: "gluten", severity: "contains" }] };
  };
  const errado = medir(conjunto, { motor: ignoraGluten });
  assert.equal(errado.negacao.certos, 5);
});

test("M7 not_informed nao conta como erro e e reportado a parte", () => {
  const real = medir(conjunto);
  assert.deepEqual(real.naoInformado, PRODUTOS_SEM_TEXTO);
  for (const caso of [...real.casos.falsosNegativos, ...real.casos.falsosPositivos]) {
    assert.equal(PRODUTOS_SEM_TEXTO.includes(caso.codigo), false, caso.caso);
  }
  assert.match(formatarModo(real), /not_informed \(fora da conta, nao e erro\): 7622210596413, 7896004006277, 07117815, 7891008116632, 7896004006239/);
  // Sem dado nenhum, nada e erro: zero par medido, zero falso negativo.
  const semDado = medir(conjunto, { motor: motorSemDado });
  assert.equal(semDado.paresMedidos, 0);
  assert.equal(semDado.total.falsoNegativo, 0);
  assert.equal(semDado.naoInformado.length, TAMANHO_DECLARADO);
  // Produto sem texto mas com tag da OFF: o motor tem dado, o gabarito nao -
  // fica fora da conta e e listado.
  const comTag = clonar({ ...conjunto, produtos: [produtoDoConjunto("07117815")] });
  comTag.produtos[0].campos.allergens_tags = ["en:milk"];
  comTag.produtos[0].gabarito.conferidoContra = hashDosCampos(comTag.produtos[0].campos);
  const soTag = medir(validarConjunto(comTag));
  assert.equal(soTag.paresMedidos, 0);
  assert.deepEqual(soTag.semTextoParaGabarito, [{ codigo: "07117815", motor: ["milk:contains"] }]);
});

test("M8 regressao: o resultado de hoje e o registrado, nos dois modos", () => {
  for (const modo of [MODOS.PIPELINE, MODOS.SO_TEXTO]) {
    const resultado = medir(conjunto, { modo });
    assert.deepEqual(conferirRegistro(resultado, registro[modo]), [], modo);
    assert.equal(resultado.paresMedidos, registro[modo].paresMedidos);
    assert.deepEqual(resultado.naoInformado, registro[modo].naoInformado);
  }
  assert.deepEqual(registro.pipeline.falsosNegativos, ["7892840819507:milk", "8718989002640:milk", "8718989002640:gluten", "8718989002640:egg"]);
  assert.deepEqual(registro.pipeline.declaradoComoTraco, []);
});

test("M8 regressao: medicao/medicao-final.txt e a saida de hoje, e a inicial e de outro motor", () => {
  const semFimDeLinha = (texto) => texto.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  const fonteDoMotor = readFileSync(path.join(rootDir, "shared/allergenEngine.js"), "utf8").replace(/\r\n/g, "\n");
  const motorSha256 = createHash("sha256").update(fonteDoMotor).digest("hex");
  const hoje = formatarRelatorio(conjunto, [medir(conjunto, { modo: MODOS.PIPELINE }), medir(conjunto, { modo: MODOS.SO_TEXTO })], { motorSha256 });
  assert.equal(semFimDeLinha(readFileSync(path.join(rootDir, "medicao/medicao-final.txt"), "utf8")), semFimDeLinha(hoje), "rode npm run medir:motor > medicao/medicao-final.txt");
  // A medicao inicial foi feita sobre o motor ANTES das correcoes.
  const inicial = readFileSync(path.join(rootDir, "medicao/medicao-inicial.txt"), "utf8");
  assert.match(inicial, /sha256 4fa4b7538d2fa8250c8ba9acf2535d10a730bbd29dcc76615a9ffd1b988c35b6/);
  assert.doesNotMatch(inicial, new RegExp(motorSha256));
  assert.match(inicial, /^TOTAL +924 +144 \(107\+37\) +139 +5 +12 +768 +0 +19$/m);
});

test("M8 regressao: o verify:release roda a conferencia da medicao", () => {
  const gate = readFileSync(path.join(rootDir, "scripts/verify-release.js"), "utf8");
  assert.match(gate, /\["medicao do motor", \(\) => npmCommand\(\["run", "medir:motor", "--", "--conferir"\]/);
  const pacote = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  assert.equal(pacote.scripts["medir:motor"], "node scripts/medir-motor.js");
  // O comando de verdade sai com 1 quando a conferencia acha problema.
  assert.match(readFileSync(path.join(rootDir, "scripts/medir-motor.js"), "utf8"), /if \(problemas\.length\) \{[\s\S]*?process\.exitCode = 1;/);
});

test("M8 regressao: UM falso negativo a mais que o registrado faz a conferencia falhar", () => {
  // O leite do Ninho (7891000325858) e apontado hoje. Um motor que deixa de
  // aponta-lo tem um falso negativo acima do numero registrado.
  const piorado = medir(conjunto, { motor: motorAlterado("7891000325858", (riscos) => riscos.filter((r) => r.id !== "milk")) });
  const problemas = conferirRegistro(piorado, registro.pipeline);
  assert.deepEqual(
    problemas.filter((p) => p.lista === "falsosNegativos"),
    [
      { tipo: "acima-do-registrado", modo: "pipeline", lista: "falsosNegativos", atual: 5, registrado: 4 },
      { tipo: "caso-novo", modo: "pipeline", lista: "falsosNegativos", caso: "7891000325858:milk" },
    ],
  );
  // Um declarado lido como traco tambem e grave e tambem falha.
  const rebaixado = medir(conjunto, {
    motor: motorAlterado("7891000325858", (riscos) => riscos.map((r) => (r.id === "milk" ? { ...r, severity: "traces" } : r))),
  });
  assert.ok(
    conferirRegistro(rebaixado, registro.pipeline).some((p) => p.tipo === "acima-do-registrado" && p.lista === "declaradoComoTraco"),
  );
});

test("M8 regressao: trocar um falso negativo por outro, com o mesmo total, tambem falha", () => {
  const trocado = medir(conjunto, {
    motor: (entrada, sel) => {
      const ninho = produtoDoConjunto("7891000325858").campos;
      const toddy = produtoDoConjunto("7892840819507").campos;
      const a = analyzeProductAllergens(entrada, sel);
      if (entrada.ingredients_text_pt === ninho.ingredients_text_pt) return { ...a, profileRisks: a.profileRisks.filter((r) => r.id !== "milk") };
      if (entrada.ingredients_text_pt === toddy.ingredients_text_pt) return { ...a, profileRisks: [...a.profileRisks, { id: "milk", severity: "traces" }] };
      return a;
    },
  });
  const problemas = conferirRegistro(trocado, registro.pipeline).filter((p) => p.lista === "falsosNegativos");
  assert.equal(problemas.some((p) => p.tipo === "acima-do-registrado"), false);
  assert.ok(problemas.some((p) => p.tipo === "caso-novo" && p.caso === "7891000325858:milk"));
  assert.ok(problemas.some((p) => p.tipo === "registro-desatualizado" && p.caso === "7892840819507:milk"));
});

// M9 - uma correcao por teste, com os produtos reais que a motivaram. A lista
// e conferida contra o conjunto: correcao sem produto do conjunto nao entra.
const CORRECOES = {
  "gluten em ingles (wheat)": ["7891000358764", "11117780"],
  "negacao em ingles (does not contain / contains no)": ["7893000394209", "7896481130137"],
  "noz de cola nao e castanha": ["7894900701517", "78933873", "7894900011159"],
};

test("M9 cada correcao do motor cita produtos reais do conjunto", () => {
  for (const [correcao, codigos] of Object.entries(CORRECOES)) {
    for (const codigo of codigos) assert.ok(produtoDoConjunto(codigo), `${correcao}: ${codigo}`);
  }
});

const riscosDoProduto = (codigo, alergias, modo = MODOS.PIPELINE) => {
  const campos = { ...produtoDoConjunto(codigo).campos };
  if (modo === MODOS.SO_TEXTO) Object.assign(campos, { allergens_tags: [], traces_tags: [], traces: "", labels_tags: [] });
  return analyzeProductAllergens(campos, alergias).profileRisks.map((r) => [r.id, r.severity]);
};

test("M9 correcao 1 - gluten em ingles: 7891000358764 (Wheat flour) e 11117780 (wheat flour)", () => {
  // 7891000358764: as tags da OFF nao trazem gluten; so o texto em ingles avisa.
  assert.deepEqual(riscosDoProduto("7891000358764", ["gluten"]), [["gluten", "contains"]]);
  assert.deepEqual(riscosDoProduto("11117780", ["gluten"], MODOS.SO_TEXTO), [["gluten", "contains"]]);
  // A regra e a palavra inteira: trigo sarraceno (buckwheat) nao e gluten.
  assert.deepEqual(analyzeProductAllergens({ ingredients_text: "buckwheat flour, salt" }, ["gluten"]).profileRisks, []);
});

test("M9 correcao 2 - negacao em ingles: 7893000394209 (does not contain gluten) e 7896481130137 (contains no gluten)", () => {
  assert.deepEqual(riscosDoProduto("7893000394209", ["gluten"]), []);
  assert.deepEqual(riscosDoProduto("7896481130137", ["gluten"]), []);
  // Cada marcador sozinho, num texto so em ingles.
  assert.deepEqual(analyzeProductAllergens({ ingredients_text: "rice, salt, does not contain gluten" }, ["gluten"]).profileRisks, []);
  assert.deepEqual(analyzeProductAllergens({ ingredients_text: "rice, salt, contains no gluten" }, ["gluten"]).profileRisks, []);
  // A negacao nao atravessa o ponto: o trigo da frase seguinte continua apontado.
  assert.deepEqual(
    analyzeProductAllergens({ ingredients_text: "Contains no gluten. Ingredients: wheat flour" }, ["gluten"]).profileRisks.map((r) => r.severity),
    ["contains"],
  );
});

test("M9 correcao 3 - noz de cola nao e castanha: 7894900701517, 78933873 e 7894900011159", () => {
  for (const codigo of CORRECOES["noz de cola nao e castanha"]) {
    assert.deepEqual(riscosDoProduto(codigo, ["nuts", "walnut"]), [], codigo);
  }
  // Castanha de verdade ao lado da noz de cola continua apontada.
  assert.deepEqual(
    analyzeProductAllergens({ ingredients_text: "extrato de noz de cola, nozes picadas" }, ["nuts", "walnut"]).profileRisks.map((r) => [r.id, r.severity]),
    [
      ["nuts", "contains"],
      ["walnut", "contains"],
    ],
  );
});

test("M10 o conjunto e o registro nao tem nada que pareca credencial, e o texto dos produtos so e dado", () => {
  const PADROES = [
    /sk-ant-[A-Za-z0-9_-]{16,}/,
    /sk-(proj|svcacct|admin|live|test)-[A-Za-z0-9_-]{16,}/,
    /\b(ANTHROPIC|OPENAI)_API_KEY\b/,
    /\bDATABASE_URL\b/,
    /postgres(ql)?:\/\/[^\s"]*@/i,
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /\b(gh[pousr]_[A-Za-z0-9]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/,
    /\b(api[_-]?key|secret|password|passwd|senha|token|bearer)\b\s*[:=]/i,
  ];
  for (const arquivo of [ARQUIVO_DO_CONJUNTO, ARQUIVO_DO_REGISTRO]) {
    const bruto = readFileSync(arquivo, "utf8");
    for (const padrao of PADROES) assert.doesNotMatch(bruto, padrao, `${path.basename(arquivo)}: ${padrao}`);
  }
  // Nenhuma cadeia longa e opaca (cara de chave: 32+ caracteres seguidos, com
  // letra e digito) no que veio da OFF.
  for (const produto of conjunto.produtos) {
    const daOff = [produto.nome, produto.marcas, ...Object.values(produto.campos).flat()].join("\n");
    const opacas = (daOff.match(/[A-Za-z0-9+/=_]{32,}/g) || []).filter((pedaco) => /\d/.test(pedaco) && /[A-Za-z]/.test(pedaco));
    assert.deepEqual(opacas, [], produto.codigo);
  }
  // O texto dos produtos nunca vira codigo: o conjunto e lido com JSON.parse, e
  // a medicao nao tem eval, Function nem import dinamico.
  for (const arquivo of ["scripts/lib/medicaoDoMotor.js", "scripts/medir-motor.js"]) {
    assert.doesNotMatch(readFileSync(path.join(rootDir, arquivo), "utf8"), /\beval\s*\(|new Function|\bimport\s*\(|node:vm/, arquivo);
  }
});

// ---------------------------------------------------------------------------
// R1..R10 - regressao, pelo codigo real
// ---------------------------------------------------------------------------

test("R1 regressao: os testes do motor que ja existiam continuam verdes, sem mudar uma linha deles", () => {
  const suites = ["tests/assistant.test.js", "tests/offline.test.js", "tests/productLookup.test.js", "tests/allergyVerdict.test.js"];
  // Sem NODE_TEST_CONTEXT, senao o processo filho fala o protocolo interno do
  // executor de testes em vez de imprimir o resumo.
  const { NODE_TEST_CONTEXT, ...ambiente } = process.env;
  const execucao = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...suites], { cwd: backendDir, encoding: "utf8", env: ambiente });
  assert.equal(execucao.status, 0, execucao.stdout.slice(-3000));
  assert.match(execucao.stdout, /^ℹ fail 0$/m);
  assert.doesNotMatch(execucao.stdout, /^ℹ pass 0$/m);
  // Os bugs exatos das auditorias antigas, pelo motor corrigido.
  const par = (produto, alergias) => analyzeProductAllergens(produto, alergias).profileRisks.map((r) => [r.id, r.severity]);
  assert.deepEqual(par({ ingredients: "sem lactose e contem leite integral" }, ["milk"]), [["milk", "contains"]]);
  assert.deepEqual(par({ ingredients: "sem gluten mas contem trigo" }, ["gluten"]), [["gluten", "contains"]]);
  assert.deepEqual(par({ ingredients: "nao contem leite mas pode conter leite" }, ["milk"]), [["milk", "traces"]]);
  assert.deepEqual(par({ ingredients: "manteiga de cacau" }, ["milk"]), []);
});

test("R2 regressao: exploit C1 - o modelo negando o conflito nao entrega falso seguro", async () => {
  const resposta = await answerAssistantChat(
    { user: null },
    { message: "Posso consumir?", conversation: [], product: { name: "Leite", ingredients_text: "leite em po integral", allergens: ["milk"] }, guestAllergies: ["milk"] },
    {
      messages: {
        create: async () => ({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ answer: "NAO contem leite, seguro.", category: "allergy", safety: "normal", usedProductContext: true }) }],
        }),
      },
    },
    { logger: { warn: () => {} } },
  );
  assert.equal(resposta.safety, "caution");
  assert.equal(resposta.allergyVerdict.status, "conflict");
  assert.equal(resposta.allergyVerdict.source, "deterministic_engine");
});

test("R3 regressao: matriz de severidade nos quatro casos", () => {
  const declarado = { name: "Pacoca", ingredients_text: "amendoim torrado, acucar" };
  const traco = { name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal", traces: ["peanuts"] };
  const v = (produto, nivel) => {
    const snap = buildAssistantContext({ product: produto, allergies: ["peanut"] }).allergySnapshot;
    return buildAllergyVerdict({ profileRisks: snap.profileRisks, profileAllergies: snap.profileAllergies, hasProductContext: snap.hasProductContext, alertLevels: { peanut: nivel } });
  };
  for (const [produto, nivel, status, piso] of [
    [declarado, "standard", "conflict", "caution"],
    [declarado, "strict", "conflict", "urgent"],
    [traco, "strict", "conflict", "caution"],
    [traco, "standard", "traces", null],
  ]) {
    const veredito = v(produto, nivel);
    assert.equal(veredito.status, status, `${produto.name}/${nivel}`);
    assert.equal(veredito.minimumSafety, piso, `${produto.name}/${nivel}`);
  }
});

test("R4 regressao: comparacao sem contaminacao, explicacao amarrada pelo codigo", () => {
  const comparacao = compareProducts(
    [
      { code: "7891000100103", product: { product_name: "Leite em po", ingredients_text: "leite em po integral" } },
      { code: "0036000291452", product: { product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" } },
    ],
    { profileAllergies: ["milk"], alertLevels: {} },
  );
  assert.equal(comparacao.products[0].allergyVerdict.status, "conflict");
  assert.equal(comparacao.products[1].allergyVerdict.status, "clear");
  assert.equal("allergyVerdict" in comparacao, false);
  const porCodigo = amarrarExplicacoes(
    [
      { productCode: "0036000291452", explanation: "ARROZ" },
      { productCode: "7891000100103", explanation: "LEITE" },
    ],
    comparacao.products,
  );
  assert.equal(porCodigo.get("7891000100103").explanation, "LEITE");
  assert.throws(() => amarrarExplicacoes([{ productCode: "0036000291452" }, { productCode: "5449000000996" }], comparacao.products));
});

async function inspecionarIndexedDB(fabrica) {
  const textos = [];
  for (const { name } of await fabrica.databases()) {
    const banco = await new Promise((ok, erro) => {
      const pedido = fabrica.open(name);
      pedido.onsuccess = () => ok(pedido.result);
      pedido.onerror = () => erro(pedido.error);
    });
    for (const loja of banco.objectStoreNames) {
      const valores = await new Promise((ok) => {
        const pedido = banco.transaction(loja, "readonly").objectStore(loja).getAll();
        pedido.onsuccess = () => ok(pedido.result);
      });
      textos.push(JSON.stringify(valores));
    }
    banco.close();
  }
  return textos.join("\n");
}

test("R5 regressao: cache offline sem veredito, perfil atual vence, logout limpa", async () => {
  const fabrica = new IDBFactory();
  const cache = criarCacheOffline({ indexedDB: fabrica, agora: () => Date.UTC(2026, 10, 6), alergiasValidas: VALID_ALLERGY_IDS });
  const conta = { id: "conta-r5", name: "R5", email: "r5@example.test", allergies: ["peanut"], alertLevels: { peanut: "strict" } };
  await aoConfirmarConta(conta, { cache });
  await guardarProdutoVisto(conta.id, { code: "7896000000019", product_name: "Pacoca R5", ingredients_text: "amendoim", allergyVerdict: { status: "clear" }, safety: "normal" }, { cache });
  const antes = await inspecionarIndexedDB(fabrica);
  assert.match(antes, /Pacoca R5/);
  assert.doesNotMatch(antes, /allergyVerdict|"safety"/);
  const lido = await consultarNoAparelho("7896000000019", { dono: conta.id, cache });
  assert.equal(avaliarNoAparelho(lido.produto, { profileAllergies: ["peanut"], alertLevels: { peanut: "strict" } }).allergyVerdict.minimumSafety, "urgent");
  assert.equal(avaliarNoAparelho(lido.produto, { profileAllergies: ["milk"] }).allergyVerdict.status, "clear");
  await aoSairDaConta({ sair: async () => {}, cache });
  const depois = await inspecionarIndexedDB(fabrica);
  for (const vestigio of ["Pacoca R5", "peanut", "conta-r5"]) assert.equal(depois.includes(vestigio), false, vestigio);
});

test("R6 regressao: o service worker nao intercepta nem grava /api/, nem com a rota na lista do shell", () => {
  const origem = "https://app.example.test";
  const shell = ["/index.html", "/assets/index-abc.js"];
  assert.equal(estrategiaPara({ method: "GET", url: `${origem}/assets/index-abc.js` }, { origem, shell }), DO_SHELL);
  for (const caminho of ["/api/profile", "/api/history", "/api/account/export", "/API/PROFILE", "/api/assistant/chat"]) {
    const url = `${origem}${caminho}`;
    assert.equal(estrategiaPara({ method: "GET", url }, { origem, shell }), IGNORAR, caminho);
    const ok = new Response('{"user":{}}', { status: 200, headers: { "content-type": "application/json" } });
    assert.equal(podeGuardar(new Request(url), ok, { origem, shell: [...shell, new URL(url).pathname] }), false, caminho);
  }
});

test("R7 regressao: acessibilidade - estado sem cor, ordem de leitura, anuncio polite", async () => {
  const { build } = await import("esbuild");
  const pacote = await build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { AllergyVerdict } from "./src/components/assistant/AllergyVerdict.jsx";
        import { AnuncioDoVeredito } from "./src/components/common/AnuncioDoVeredito.jsx";
        import { AssistantPage } from "./src/pages/Assistant/AssistantPage.jsx";
        export const componentes = { AllergyVerdict, AnuncioDoVeredito, AssistantPage };
        export const h = React.createElement;
        export const render = (elemento) => renderToStaticMarkup(elemento);
      `,
      resolveDir: rootDir,
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl", ".jpg": "dataurl", ".woff": "empty", ".woff2": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  const pasta = mkdtempSync(path.join(tmpdir(), "nutriscan-medicao-telas-"));
  let tela;
  try {
    const arquivo = path.join(pasta, "telas.mjs");
    writeFileSync(arquivo, pacote.outputFiles[0].text, "utf8");
    tela = await import(pathToFileURL(arquivo).href);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
  const semCor = (html) => html.replace(/\sclass="[^"]*"/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const vereditos = {
    conflito: buildAllergyVerdict({ profileRisks: [{ id: "milk", label: "Leite/lactose", severity: "contains" }], profileAllergies: ["milk"], hasProductContext: true }),
    traco: buildAllergyVerdict({ profileRisks: [{ id: "milk", label: "Leite/lactose", severity: "traces" }], profileAllergies: ["milk"], hasProductContext: true }),
    semConflito: buildAllergyVerdict({ profileRisks: [], profileAllergies: ["milk"], hasProductContext: true }),
    naoAvaliado: buildAllergyVerdict({ profileRisks: [], profileAllergies: [], hasProductContext: true }),
  };
  const textos = Object.values(vereditos).map((verdict) => semCor(tela.render(tela.h(tela.componentes.AllergyVerdict, { verdict }))));
  assert.equal(new Set(textos).size, 4, "dois estados do veredito so se distinguem pela cor");
  assert.match(textos[0], /Conflito com o seu perfil/);
  assert.match(textos[3], /Não avaliado/);
  assert.match(tela.render(tela.h(tela.componentes.AnuncioDoVeredito, {})), /aria-live="polite"/);
  const assistente = tela.render(
    tela.h(tela.componentes.AssistantPage, {
      chatLogRef: { current: null },
      assistantConnection: { type: "success", message: "ok" },
      assistantMessages: [{ role: "assistant", text: "TEXTO-DO-MODELO", source: "anthropic", verdict: vereditos.conflito }],
      assistantLoading: false,
      assistantQuestion: "",
      hasLastQuestion: false,
      onQuestionChange: () => {},
      onSubmitAssistant: () => {},
      onRetryAssistant: () => {},
    }),
  );
  assert.ok(assistente.indexOf('role="group"') < assistente.indexOf("TEXTO-DO-MODELO"), "o veredito deixou de vir antes do texto do modelo");
});

async function comServidor(app, callback) {
  const servidor = createServer(app);
  await new Promise((resolve) => servidor.listen(0, "127.0.0.1", resolve));
  try {
    return await callback(`http://127.0.0.1:${servidor.address().port}`);
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
}

test("R8 regressao: isolamento, exportacao e exclusao - sem sessao, tudo responde 401", async () => {
  await comServidor(createApp(), async (base) => {
    assert.equal((await fetch(`${base}/api/account/export`)).status, 401);
    const excluir = await fetch(`${base}/api/account`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: '{"password":"x"}' });
    assert.equal(excluir.status, 401);
    assert.equal((await fetch(`${base}/api/history?userId=1`)).status, 401);
    assert.equal((await fetch(`${base}/api/favorites?userId=1`)).status, 401);
  });
});

test("R9 regressao: digito verificador, UPC-A canonicalizado e tetos da comparacao", () => {
  assert.equal(validarCodigoDeBarras("7891000100103").valido, true);
  assert.equal(validarCodigoDeBarras("7891000100104").valido, false);
  assert.equal(validarCodigoDeBarras("036000291452").codigo, "0036000291452");
  assert.equal(TETO_COMPARACAO_POR_USUARIO, 30);
  assert.equal(TETO_COMPARACAO_POR_IP, 300);
  assert.equal(criarLimitadoresDeComparacao().length, 2);
});

test("R10 regressao: handler de erro (JSON malformado e 400 sem detalhe, rota desconhecida 404) e fail-closed sem IA", async () => {
  await comServidor(createApp(), async (base) => {
    const resposta = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nao-e-json" });
    assert.equal(resposta.status, 400);
    const texto = await resposta.text();
    assert.equal(JSON.parse(texto).error.code, "INVALID_JSON");
    assert.doesNotMatch(texto, /SyntaxError|Unexpected token|\n\s+at /);
    const inexistente = await fetch(`${base}/api/nao-existe`);
    assert.equal(inexistente.status, 404);
    assert.match(inexistente.headers.get("content-type") ?? "", /json/);
  });
  // Sem chave e sem cliente, o assistente falha fechado com codigo neutro.
  await assert.rejects(
    answerAssistantChat({ user: null }, { message: "Posso consumir?", conversation: [], guestAllergies: ["milk"] }, null, { logger: { warn: () => {} } }),
    (erro) => erro?.code === "AI_NOT_CONFIGURED",
  );
});
