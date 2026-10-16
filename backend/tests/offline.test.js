import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { IDBFactory } from "fake-indexeddb";

import { analyzeProductAllergens } from "../../shared/allergenEngine.js";
import { applyAllergyAuthority, buildAllergyVerdict, PROFILE_SOURCE } from "../../shared/allergyVerdict.js";
import { VALID_ALLERGY_IDS } from "../../shared/allergens.js";
import {
  BANCO_OFFLINE,
  CAMPOS_DO_PRODUTO,
  criarCacheOffline,
  LIMITE_DE_PRODUTOS_POR_DONO,
  reduzirProduto,
  VALIDADE_DO_PRODUTO_MS,
  VISITANTE,
} from "../../src/services/offlineCache.js";
import {
  avaliarNoAparelho,
  buscarNoAparelho,
  consultarNoAparelho,
  EXPIRADO_NO_APARELHO,
  guardarProdutoVisto,
  iniciarPrazoDaRede,
  NAO_DISPONIVEL_OFFLINE,
  NO_APARELHO,
  PRAZO_DA_REDE_MS,
  SEM_INTERNET,
} from "../../src/services/offlineLookup.js";
import {
  aoConfirmarConta,
  aoExcluirConta,
  aoSairDaConta,
  escreverComInternet,
  recuperarSessao,
} from "../../src/services/offlineSession.js";
import { CODIGO_INVALIDO, ORIGEM_CAMERA, prepararCodigo } from "../../src/services/productLookup.js";

// v0.11.0 - leitura sem rede.
//
// O ARMAZENAMENTO DESTES TESTES. O cache usa IndexedDB. Aqui, a implementacao e
// a do `fake-indexeddb`: uma implementacao completa da API (bancos, lojas,
// indices, transacoes), nao um objeto que finge sucesso. O codigo do app grava
// por ela exatamente como grava no navegador, e os testes NAO usam o leitor do
// proprio modulo para conferir o que ficou: `inspecionar` abre cada banco que
// existir e le cada chave e cada valor de cada loja, cru.
//
// O `localStorage` (as chaves antigas de visitante) e uma implementacao em
// memoria da Web Storage API, inspecionada do mesmo jeito.
//
// O que isto NAO prova: o IndexedDB do navegador de verdade. Essa parte e a
// verificacao no navegador, descrita no AUDIT_REPORT.

let esbuild = null;
try {
  esbuild = await import("esbuild");
  await import("react");
  await import("react-dom/server");
} catch {
  esbuild = null;
}
function semEsbuild() {
  return esbuild ? false : "NAO EXECUTADO - esbuild/react ausentes: instale as dependencias do package raiz";
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

class MemoriaLocal {
  #dados = new Map();
  get length() {
    return this.#dados.size;
  }
  key(i) {
    return [...this.#dados.keys()][i] ?? null;
  }
  getItem(chave) {
    return this.#dados.has(String(chave)) ? this.#dados.get(String(chave)) : null;
  }
  setItem(chave, valor) {
    this.#dados.set(String(chave), String(valor));
  }
  removeItem(chave) {
    this.#dados.delete(String(chave));
  }
  clear() {
    this.#dados.clear();
  }
}

function pedido(requisicao) {
  return new Promise((resolve, reject) => {
    requisicao.onsuccess = () => resolve(requisicao.result);
    requisicao.onerror = () => reject(requisicao.error);
  });
}

// Tudo o que existe no armazenamento, cru: todo banco, toda loja, toda chave,
// todo valor - e todo o localStorage.
async function inspecionar(fabrica, local) {
  const registros = [];
  for (const { name } of await fabrica.databases()) {
    const banco = await pedido(fabrica.open(name));
    for (const loja of banco.objectStoreNames) {
      const transacao = banco.transaction(loja, "readonly");
      const chaves = await pedido(transacao.objectStore(loja).getAllKeys());
      const valores = await pedido(transacao.objectStore(loja).getAll());
      chaves.forEach((chave, i) => registros.push({ banco: name, loja, chave, valor: valores[i] }));
    }
    banco.close();
  }
  const locais = [];
  for (let i = 0; i < (local?.length ?? 0); i += 1) {
    const chave = local.key(i);
    locais.push({ chave, valor: local.getItem(chave) });
  }
  const texto = JSON.stringify({ registros, locais });
  return { registros, locais, texto };
}

// Todas as chaves de objeto, em qualquer profundidade. Os NOMES de nutriente
// (`salt_100g` e o sal do rotulo) ficam de fora - e `nutrientesDe` confere a
// parte: la so pode haver numero ou texto curto.
function todasAsChaves(valor, saida = new Set()) {
  if (Array.isArray(valor)) valor.forEach((item) => todasAsChaves(item, saida));
  else if (valor && typeof valor === "object") {
    for (const [chave, item] of Object.entries(valor)) {
      saida.add(chave);
      if (chave !== "nutriments") todasAsChaves(item, saida);
    }
  }
  return saida;
}

function nutrientesDe(registros) {
  return registros.filter((registro) => registro.valor?.produto?.nutriments).map((registro) => registro.valor.produto.nutriments);
}

function novoAparelho(inicio = Date.UTC(2026, 9, 16, 12)) {
  const fabrica = new IDBFactory();
  const relogio = { agora: inicio };
  const cache = criarCacheOffline({ indexedDB: fabrica, agora: () => relogio.agora, alergiasValidas: VALID_ALLERGY_IDS });
  return { fabrica, cache, relogio };
}

const COD_PACOCA = "7896000000019";
const PACOCA = {
  code: COD_PACOCA,
  product_name: "Pacoca Offline",
  brands: "Marca P",
  ingredients_text: "amendoim torrado, acucar",
  // Com sal: na Open Food Facts, "salt" e o nutriente - e o teste de credencial
  // precisa saber a diferenca.
  nutriments: { "energy-kcal_100g": 520, sugars_100g: 30, salt_100g: 0.4, salt_unit: "g" },
};
const COD_BOLACHA = "7896000000026";
const BOLACHA_TRACO = {
  code: COD_BOLACHA,
  product_name: "Bolacha Offline",
  ingredients_text: "farinha de arroz, sal",
  traces_tags: ["en:peanuts"],
};
const COD_LEITE = "7891000100103";
const LEITE = { code: COD_LEITE, product_name: "Leite Offline", ingredients_text: "leite integral" };
const COD_UPCA = "036000291452";
const COD_UPCA_CANONICO = "0036000291452";
const ARROZ = { code: COD_UPCA_CANONICO, product_name: "Biscoito de arroz", ingredients_text: "farinha de arroz, sal" };

const ANA = { id: "conta-ana", name: "Ana", email: "ana@example.test", allergies: ["peanut"], alertLevels: { peanut: "strict" } };
const BIA = { id: "conta-bia", name: "Bia", email: "bia@example.test", allergies: ["milk"], alertLevels: {} };

function perfilDe(registro) {
  return { profileAllergies: registro.alergias, alertLevels: registro.niveis };
}

// ---------------------------------------------------------------------------
// O1 e O2 - o que esta no aparelho aparece marcado; o que nao esta, nao aparece
// ---------------------------------------------------------------------------

test("O1 produto no aparelho + sem rede: os dados do cache, marcados, com a data do dado", async () => {
  const { cache, relogio } = novoAparelho();
  await guardarProdutoVisto(ANA.id, PACOCA, { cache });
  const guardadoEm = relogio.agora;
  relogio.agora += 2 * 24 * 60 * 60 * 1000;

  const lido = await consultarNoAparelho(COD_PACOCA, { dono: ANA.id, cache });
  assert.equal(lido.estado, NO_APARELHO);
  assert.equal(lido.guardadoEm, guardadoEm, "a data e a de quando o dado veio da internet, nao a da leitura");
  assert.equal(lido.produto.product_name, "Pacoca Offline");
  assert.equal(lido.produto.ingredients_text, "amendoim torrado, acucar");
  assert.deepEqual(lido.produto.nutriments, PACOCA.nutriments);
});

test("O1 a tela do produto vindo do aparelho diz de onde veio e de quando", { skip: semEsbuild() }, async () => {
  const html = textoVisivel(
    await renderizar("ProductAnalysis", {
      ...propsDoProduto(PACOCA),
      origemDoDado: { fonte: "aparelho", guardadoEm: Date.UTC(2026, 9, 14, 12), motivo: SEM_INTERNET },
      vereditoDoAparelho: avaliarNoAparelho(PACOCA, perfilDe({ alergias: ["peanut"], niveis: { peanut: "strict" } }))
        .allergyVerdict,
    }),
  );
  assert.match(html, /Do aparelho · guardado em 14\/10\/2026/);
  assert.match(html, /Sem internet\. Estes são os dados guardados neste aparelho\./);
  assert.match(html, /O alerta de alergia foi refeito agora, com o seu perfil\./);
  assert.match(html, /Amendoim/);

  // Com o dado vindo da rede, nada de aviso de aparelho.
  const fresco = textoVisivel(await renderizar("ProductAnalysis", { ...propsDoProduto(PACOCA), origemDoDado: { fonte: "rede" } }));
  assert.doesNotMatch(fresco, /Do aparelho|guardado neste aparelho/);
});

test("O2 produto NAO guardado + sem rede: 'nao disponivel offline', explicito - nunca resultado vazio nem aproximado", async () => {
  const { cache } = novoAparelho();
  await guardarProdutoVisto(ANA.id, PACOCA, { cache });

  const ausente = await consultarNoAparelho("7891000100103", { dono: ANA.id, cache });
  assert.deepEqual(ausente, { estado: NAO_DISPONIVEL_OFFLINE, codigo: "7891000100103" });
  assert.equal("produto" in ausente, false, "veio um produto onde nao havia");

  // Nada de produto "parecido": mesmo prefixo, mesma marca, um digito trocado
  // (com digito verificador valido) - nenhum devolve a pacoca.
  for (const vizinho of ["7896000000033", "7896000000040"]) {
    assert.equal((await consultarNoAparelho(vizinho, { dono: ANA.id, cache })).estado, NAO_DISPONIVEL_OFFLINE, vizinho);
  }

  // A tela diz isso com todas as letras.
  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  assert.match(app, /não está disponível offline\. Ele só fica guardado depois de aberto com internet\./);
});

// ---------------------------------------------------------------------------
// O3 - o veredito nunca entra no cache
// ---------------------------------------------------------------------------

test("O3 o cache NAO contem allergyVerdict nem resultado do motor em nenhuma chave", async () => {
  const { fabrica, cache } = novoAparelho();
  await aoConfirmarConta(ANA, { cache });
  // Um produto "contaminado", como se o app tentasse gravar o que exibe.
  const exibido = {
    ...PACOCA,
    allergyVerdict: { status: "clear", minimumSafety: null, conflicts: [] },
    verdict: "clear",
    safety: "normal",
    profileRisks: [{ id: "peanut" }],
    allRisks: [{ id: "peanut" }],
    hasData: true,
    source: "Open Food Facts",
    isLocal: false,
  };
  await guardarProdutoVisto(ANA.id, exibido, { cache });
  await cache.guardarColecoes(ANA.id, {
    historico: [{ id: "h1", productCode: COD_PACOCA, productName: "Pacoca", allergyVerdict: { status: "clear" } }],
    favoritos: [],
  });

  const { registros } = await inspecionar(fabrica);
  const chaves = todasAsChaves(registros.map((registro) => registro.valor));
  for (const proibida of ["allergyVerdict", "verdict", "minimumSafety", "conflicts", "safety", "profileRisks", "allRisks", "hasData", "safetyFloorApplied"]) {
    assert.equal(chaves.has(proibida), false, `o cache guardou "${proibida}"`);
  }
  // E o que entra no produto e exatamente a lista fechada.
  const produto = registros.find((registro) => registro.loja === "produtos").valor.produto;
  for (const campo of Object.keys(produto)) assert.ok(CAMPOS_DO_PRODUTO.includes(campo), `campo fora da lista: ${campo}`);
});

// ---------------------------------------------------------------------------
// O4 e O5 - o veredito offline e refeito, com o perfil de AGORA
// ---------------------------------------------------------------------------

async function lerSemRede(cache, codigo) {
  const sessao = await recuperarSessao({
    getMe: async () => {
      throw Object.assign(new Error("sem rede"), { status: 0 });
    },
    cache,
  });
  assert.equal(sessao.tipo, "aparelho");
  const lido = await consultarNoAparelho(codigo, { dono: sessao.perfil.id, cache });
  assert.equal(lido.estado, NO_APARELHO);
  return avaliarNoAparelho(lido.produto, perfilDe(sessao.perfil));
}

test("O4 perfil alterado DEPOIS do cache: a leitura offline reflete o perfil NOVO", async () => {
  const { cache } = novoAparelho();
  // O produto entra no aparelho com a Ana em alerta maximo para amendoim...
  await aoConfirmarConta(ANA, { cache });
  await guardarProdutoVisto(ANA.id, PACOCA, { cache });
  assert.equal((await lerSemRede(cache, COD_PACOCA)).safety, "urgent");

  // ...depois, com rede, ela volta o amendoim para o alerta padrao.
  await aoConfirmarConta({ ...ANA, alertLevels: { peanut: "standard" } }, { cache });
  const padrao = await lerSemRede(cache, COD_PACOCA);
  assert.equal(padrao.safety, "caution", "a leitura offline usou o perfil do momento do cache");
  assert.deepEqual(padrao.allergyVerdict.conflicts, [{ id: "peanut", label: "Amendoim" }]);

  // ...e depois tira o amendoim e marca leite: a pacoca fica sem conflito.
  await aoConfirmarConta({ ...ANA, allergies: ["milk"], alertLevels: {} }, { cache });
  const semAmendoim = await lerSemRede(cache, COD_PACOCA);
  assert.equal(semAmendoim.allergyVerdict.status, "clear");
  assert.equal(semAmendoim.safety, "normal");

  // O inverso: alergia NOVA marcada depois do cache aparece offline.
  await aoConfirmarConta({ ...ANA, allergies: ["milk", "peanut"], alertLevels: {} }, { cache });
  assert.equal((await lerSemRede(cache, COD_PACOCA)).allergyVerdict.status, "conflict");
});

test("O5 severidade offline: estrito+declarado urgent; estrito+traco conflito caution; padrao como sempre", async () => {
  const estrito = { profileAllergies: ["peanut"], alertLevels: { peanut: "strict" } };
  const padrao = { profileAllergies: ["peanut"], alertLevels: {} };

  const declaradoEstrito = avaliarNoAparelho(PACOCA, estrito);
  assert.equal(declaradoEstrito.allergyVerdict.minimumSafety, "urgent");
  assert.equal(declaradoEstrito.safety, "urgent");

  const tracoEstrito = avaliarNoAparelho(BOLACHA_TRACO, estrito);
  assert.equal(tracoEstrito.allergyVerdict.status, "conflict");
  assert.equal(tracoEstrito.allergyVerdict.minimumSafety, "caution");
  assert.equal(tracoEstrito.safety, "caution");
  assert.equal(tracoEstrito.allergyVerdict.conflicts[0].origin, "traces");

  const declaradoPadrao = avaliarNoAparelho(PACOCA, padrao);
  assert.equal(declaradoPadrao.safety, "caution");
  assert.deepEqual(declaradoPadrao.allergyVerdict.conflicts, [{ id: "peanut", label: "Amendoim" }]);

  const tracoPadrao = avaliarNoAparelho(BOLACHA_TRACO, padrao);
  assert.equal(tracoPadrao.allergyVerdict.status, "traces");
  assert.equal(tracoPadrao.allergyVerdict.minimumSafety, null);
  assert.equal(tracoPadrao.safety, "normal");
});

// ---------------------------------------------------------------------------
// O6 a O8 - o mesmo motor e a mesma conferencia de codigo
// ---------------------------------------------------------------------------

test("O6 o motor offline e o de shared/, sem segunda implementacao", () => {
  const perfil = { profileAllergies: ["peanut", "milk"], alertLevels: { peanut: "strict" } };
  for (const produto of [PACOCA, BOLACHA_TRACO, LEITE, ARROZ, { code: "1", product_name: "Sem rotulo" }]) {
    const offline = avaliarNoAparelho(produto, perfil);
    const scan = analyzeProductAllergens(produto, perfil.profileAllergies);
    assert.deepEqual(offline.scan, scan);
    const esperado = applyAllergyAuthority(
      { safety: "normal" },
      buildAllergyVerdict({
        profileRisks: scan.profileRisks,
        profileAllergies: perfil.profileAllergies,
        hasProductContext: true,
        profileSource: PROFILE_SOURCE.request,
        alertLevels: perfil.alertLevels,
        allergenDataAvailable: scan.hasData,
      }),
    );
    assert.deepEqual(offline.allergyVerdict, esperado.allergyVerdict);
  }

  const fonte = readFileSync(path.join(rootDir, "src/services/offlineLookup.js"), "utf8");
  assert.match(fonte, /from "\.\.\/\.\.\/shared\/allergenEngine\.js"/);
  assert.match(fonte, /from "\.\.\/\.\.\/shared\/allergyVerdict\.js"/);
  // Nenhum dicionario de alergenico, nenhuma regex de ingrediente aqui.
  assert.doesNotMatch(fonte, /amendoim|leite|lactose|gluten|peanut|milk/i);
});

test("O7 codigo invalido offline e recusado pela mesma funcao, ANTES de consultar o cache", async () => {
  let leituras = 0;
  const cache = {
    lerProduto: async () => {
      leituras += 1;
      return null;
    },
  };
  for (const invalido of ["7891000100104", "0036000291453", "12345", "abc"]) {
    const offline = await consultarNoAparelho(invalido, { dono: ANA.id, cache });
    assert.equal(offline.estado, CODIGO_INVALIDO, invalido);
    assert.deepEqual(offline, prepararCodigo(invalido), "a recusa nao e a da conferencia de sempre");
  }
  assert.equal(leituras, 0, "o cache foi consultado com codigo invalido");

  const fonte = readFileSync(path.join(rootDir, "src/services/offlineLookup.js"), "utf8");
  assert.match(fonte, /import \{ CODIGO_INVALIDO, identidadeDoCodigo, ORIGEM_MANUAL, prepararCodigo \} from "\.\/productLookup\.js";/);
  assert.doesNotMatch(fonte, /digitoVerificador|% 10/, "segunda implementacao do digito verificador");
});

test("O8 UPC-A offline acha o produto guardado como EAN-13 - e o contrario", async () => {
  const { cache } = novoAparelho();
  await guardarProdutoVisto(ANA.id, ARROZ, { cache });
  const porUpca = await consultarNoAparelho(COD_UPCA, { dono: ANA.id, cache });
  assert.equal(porUpca.estado, NO_APARELHO);
  assert.equal(porUpca.codigo, COD_UPCA_CANONICO);

  // A Open Food Facts pode devolver o codigo com 12 digitos: a chave e a canonica.
  const outro = novoAparelho();
  await guardarProdutoVisto(ANA.id, { ...ARROZ, code: COD_UPCA }, { cache: outro.cache });
  assert.equal((await consultarNoAparelho(COD_UPCA_CANONICO, { dono: ANA.id, cache: outro.cache })).estado, NO_APARELHO);

  // E a leitura da camera, que nao confere digito, chega na mesma chave.
  assert.equal((await consultarNoAparelho(COD_UPCA, { origem: ORIGEM_CAMERA, dono: ANA.id, cache })).estado, NO_APARELHO);
});

// ---------------------------------------------------------------------------
// O9 a O12 - o que sai do aparelho, e quando
// ---------------------------------------------------------------------------

async function popularAna(cache) {
  await aoConfirmarConta(ANA, { cache });
  await guardarProdutoVisto(ANA.id, PACOCA, { cache });
  await guardarProdutoVisto(ANA.id, BOLACHA_TRACO, { cache });
  await cache.guardarColecoes(ANA.id, {
    historico: [{ id: "h1", productCode: COD_PACOCA, productName: "Pacoca Offline", viewedAt: "2026-10-16T12:00:00Z" }],
    favoritos: [{ id: "f1", productCode: COD_BOLACHA, productName: "Bolacha Offline", createdAt: "2026-10-16T12:00:00Z" }],
  });
}

test("O9 LOGOUT limpa o cache: nenhuma chave e nenhum VALOR com o id de alergia ou o historico da conta", async () => {
  for (const servidorResponde of [true, false]) {
    const { fabrica, cache } = novoAparelho();
    // O visitante deste aparelho tem o dele, sem amendoim.
    await guardarProdutoVisto(VISITANTE, LEITE, { cache });
    await popularAna(cache);

    const antes = await inspecionar(fabrica);
    assert.match(antes.texto, /peanut/, "o teste nao populou o perfil");
    assert.match(antes.texto, /Pacoca Offline/);

    const saida = await aoSairDaConta({
      sair: async () => {
        if (!servidorResponde) throw Object.assign(new Error("sem rede"), { status: 0 });
      },
      cache,
    });
    assert.equal(saida.servidorRespondeu, servidorResponde);

    const depois = await inspecionar(fabrica);
    for (const vestigio of ["peanut", "strict", ANA.id, "Ana", COD_PACOCA, COD_BOLACHA, "Pacoca Offline", "Bolacha Offline", "h1", "f1"]) {
      assert.equal(depois.texto.includes(vestigio), false, `sobrou "${vestigio}" (servidor ${servidorResponde ? "respondeu" : "fora"})`);
    }
    assert.equal(depois.registros.some((registro) => registro.loja === "sessao"), false, "a marca de sessao ficou");
    // O do visitante continua: e dele, e nunca veio da conta.
    assert.ok(depois.registros.some((registro) => registro.chave?.[0] === VISITANTE && registro.chave?.[1] === COD_LEITE));
  }
});

test("O9 cadastro: as alergias de visitante vao para a conta e saem do armazenamento local", { skip: semEsbuild() }, async () => {
  const anterior = globalThis.localStorage;
  const local = new MemoriaLocal();
  globalThis.localStorage = local;
  try {
    const { limparAlergiasDeVisitante, writeStoredAllergies, GUEST_ALLERGIES_KEY } = await importarStorageService();
    writeStoredAllergies(["peanut"]);
    assert.match((await inspecionar(new IDBFactory(), local)).texto, /peanut/);
    assert.equal(limparAlergiasDeVisitante(), true);
    assert.equal(local.getItem(GUEST_ALLERGIES_KEY), null);
    assert.doesNotMatch((await inspecionar(new IDBFactory(), local)).texto, /peanut/);
  } finally {
    globalThis.localStorage = anterior;
  }

  // E o App chama a limpeza no cadastro aceito - e so nele.
  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  const chamadas = app.match(/limparAlergiasDeVisitante\(\)/g) || [];
  assert.equal(chamadas.length, 1);
  const cadastro = app.slice(app.indexOf("await registerAccount({"), app.indexOf("Conta criada. Suas alergias estão salvas."));
  assert.match(cadastro, /limparAlergiasDeVisitante\(\);/);
});

test("O9 o App limpa o cache ao sair - e em toda volta a visitante", () => {
  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  const sair = app.slice(app.indexOf("const logout = async () => {"), app.indexOf("const exportarDados"));
  assert.match(sair, /await aoSairDaConta\(\{ sair: logoutAccount \}\)/);
  const visitante = app.slice(app.indexOf("const restoreGuestSession = useCallback"), app.indexOf("useEffect(() => {\n    currentUserRef.current = currentUser;"));
  assert.match(visitante, /aoPerderSessao\(\);/);
});

test("O10 exclusao de conta limpa o cache no aparelho - so depois de o servidor confirmar", async () => {
  const { fabrica, cache } = novoAparelho();
  await popularAna(cache);

  // Exclusao recusada (senha errada, sem rede): a conta existe, o cache fica.
  await assert.rejects(
    aoExcluirConta("errada", {
      excluir: async () => {
        throw Object.assign(new Error("senha"), { status: 403 });
      },
      cache,
    }),
  );
  assert.match((await inspecionar(fabrica)).texto, /peanut/);

  let senhaRecebida = null;
  await aoExcluirConta("certa", {
    excluir: async (senha) => {
      senhaRecebida = senha;
      return { ok: true };
    },
    cache,
  });
  assert.equal(senhaRecebida, "certa");
  const depois = await inspecionar(fabrica);
  for (const vestigio of ["peanut", ANA.id, "Pacoca Offline", COD_PACOCA]) {
    assert.equal(depois.texto.includes(vestigio), false, `sobrou "${vestigio}" depois da exclusao`);
  }

  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  assert.match(app, /await aoExcluirConta\(senha, \{ excluir: excluirMinhaConta \}\);/);
});

test("O11 o cache nunca contem senha, hash, salt, token, cookie, chave de API nem e-mail", async () => {
  const { fabrica, cache } = novoAparelho();
  const segredos = {
    password: "senha-de-verdade-123",
    passwordHash: "hash-0123456789abcdef",
    password_hash: "hash-fedcba9876543210",
    passwordSalt: "salt-abcdef",
    password_salt: "salt-123456",
    token: "tok-sessao-xyz",
    sessionToken: "tok-outra-sessao",
    token_hash: "tokhash-999",
    cookie: "nutriscan_session=abc123",
    // Iscas montadas em tempo de execucao, como no verifyDeploy.test.js: o
    // secret scan barra, com razao, o formato de chave escrito no fonte.
    apiKey: ["sk", "ant", "api03", "ISCAISCAISCAISCAISCA"].join("-"),
    ANTHROPIC_API_KEY: ["sk", "ant", "api03", "OUTRAISCAOUTRAISCA"].join("-"),
  };
  // Como se o servidor, por defeito, devolvesse tudo isso junto do usuario.
  await aoConfirmarConta({ ...ANA, ...segredos }, { cache });
  await guardarProdutoVisto(ANA.id, { ...PACOCA, ...segredos }, { cache });
  await cache.guardarColecoes(ANA.id, { historico: [{ productCode: COD_PACOCA, ...segredos }], favoritos: [] });

  const { registros, texto } = await inspecionar(fabrica);
  for (const valor of [...Object.values(segredos), ANA.email]) {
    assert.equal(texto.includes(valor), false, `o cache guardou um valor sensivel: ${valor.slice(0, 12)}...`);
  }
  for (const chave of todasAsChaves(registros.map((registro) => registro.valor))) {
    assert.doesNotMatch(chave, /password|hash|salt|token|cookie|api.?key|email|secret/i, `chave sensivel no cache: ${chave}`);
  }
  // "salt" so como nutriente, com valor de nutriente.
  for (const nutrientes of nutrientesDe(registros)) {
    for (const [chave, valor] of Object.entries(nutrientes)) {
      assert.ok(typeof valor === "number" || (typeof valor === "string" && valor.length <= 50), `nutriente estranho: ${chave}`);
      assert.doesNotMatch(chave, /password|token|cookie|api.?key|email|secret/i, `credencial disfarcada de nutriente: ${chave}`);
    }
  }
  assert.equal(nutrientesDe(registros)[0].salt_100g, 0.4, "o sal do rotulo sumiu junto");
});

test("O12 o cache de A nao e legivel por B no mesmo aparelho", async () => {
  const { fabrica, cache } = novoAparelho();
  await popularAna(cache);

  // B nao le o produto de A, nem com A ainda no aparelho.
  assert.equal((await consultarNoAparelho(COD_PACOCA, { dono: BIA.id, cache })).estado, NAO_DISPONIVEL_OFFLINE);
  assert.equal(await cache.lerColecoes(BIA.id), null);
  assert.equal(await cache.lerPerfil(BIA.id), null);

  // B entra: o aparelho guarda uma conta por vez, e a de A sai inteira.
  await aoConfirmarConta(BIA, { cache });
  const depois = await inspecionar(fabrica);
  for (const vestigio of ["peanut", ANA.id, "Pacoca Offline", COD_PACOCA]) {
    assert.equal(depois.texto.includes(vestigio), false, `B entrou e sobrou "${vestigio}" de A`);
  }
  assert.equal((await cache.lerSessao()).id, BIA.id);
  assert.equal(await cache.lerPerfil(ANA.id), null);
  // E o visitante nao le nada de conta.
  assert.equal(await cache.lerPerfil(VISITANTE), null);
});

// ---------------------------------------------------------------------------
// O13 a O16 - rede, escrita e validade
// ---------------------------------------------------------------------------

test("O13 com rede, o app usa a rede: o cache nao impede consulta fresca", () => {
  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  const busca = app.slice(app.indexOf("const searchProduct = useCallback("), app.indexOf("const startScanner"));

  // Sem a marca de "sem internet" do navegador, a rede e SEMPRE consultada.
  const atalho = busca.indexOf("if (semInternet()) {\n        const doAparelho");
  const rede = busca.indexOf("const resultado = await consultarProdutoPorCodigo(nextQuery, { origem });");
  assert.ok(atalho > -1 && rede > atalho, "o atalho sem internet sumiu ou passou da consulta");
  assert.match(busca.slice(atalho, rede), /mostrarDoAparelho\(doAparelho, SEM_INTERNET\);\n\s+return;\n\s+\}/);

  // O que a rede devolve e o que aparece, marcado como "rede".
  assert.match(busca, /selectProduct\(resultado\.produto, \{ fonte: "rede" \}\);/);
  // E a resposta fresca derruba a copia do aparelho, inclusive "nao encontrado".
  assert.match(busca, /if \(mostrouDoAparelho\) \{\n\s+setProduct\(null\);/);

  // O produto aberto com rede atualiza a copia; o lido do aparelho, nao.
  const efeito = app.slice(app.indexOf("// Produto lido do APARELHO e releitura"), app.indexOf("recordGuestView(referencia)"));
  assert.match(efeito, /if \(origemDoProduto\?\.fonte === "aparelho"\) return;/);
  assert.match(efeito, /guardarProdutoVisto\(/);
});

test("O13 produto reaberto com rede substitui a copia antiga do aparelho, com data nova", async () => {
  const { cache, relogio } = novoAparelho();
  await guardarProdutoVisto(ANA.id, { ...PACOCA, ingredients_text: "receita antiga" }, { cache });
  relogio.agora += 10 * 24 * 60 * 60 * 1000;
  await guardarProdutoVisto(ANA.id, { ...PACOCA, ingredients_text: "amendoim, receita nova" }, { cache });
  const lido = await consultarNoAparelho(COD_PACOCA, { dono: ANA.id, cache });
  assert.equal(lido.produto.ingredients_text, "amendoim, receita nova");
  assert.equal(lido.guardadoEm, relogio.agora);
});

test("O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram", async () => {
  const anterior = globalThis.localStorage;
  const local = new MemoriaLocal();
  globalThis.localStorage = local;
  try {
    const { fabrica, cache } = novoAparelho();
    await popularAna(cache);
    const antes = await inspecionar(fabrica, local);

    let chamadas = 0;
    for (const acao of ["favoritar", "alergia", "historico"]) {
      const escrita = await escreverComInternet(
        async () => {
          chamadas += 1;
          return { acao };
        },
        { online: () => false },
      );
      assert.deepEqual(escrita, { gravado: false, motivo: "sem_internet" });
    }
    assert.equal(chamadas, 0, "a escrita foi feita sem rede");
    const depois = await inspecionar(fabrica, local);
    assert.equal(depois.texto, antes.texto, "algo foi guardado sem rede - fila ou escrita local");

    // Com rede, a escrita acontece - uma vez, na hora.
    assert.deepEqual(await escreverComInternet(async () => ({ ok: 1 }), { online: () => true }), { gravado: true, resultado: { ok: 1 } });
  } finally {
    globalThis.localStorage = anterior;
  }

  // O App passa toda escrita de conta por essa porta, e nao muda alergia sem rede.
  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  for (const chamada of [
    "escreverComInternet(() => apiToggleFavorite(referencia))",
    "escreverComInternet(() => apiDeleteHistoryItem(item.id))",
    "escreverComInternet(() => apiClearHistory())",
    "escreverComInternet(() => apiDeleteFavorite(item.id))",
  ]) {
    assert.ok(app.includes(chamada), `escrita fora da porta: ${chamada}`);
  }
  const alergia = app.slice(app.indexOf("const toggleAllergy = (id) => {"), app.indexOf("const updateAuthForm"));
  assert.equal((alergia.match(/semInternet\(\)/g) || []).length, 2, "mudar alergia ou nivel sem rede nao e barrado");
});

test("O15 'online mas sem resposta': passado o prazo, o aparelho; a resposta da rede ainda manda", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let vencido = 0;
  iniciarPrazoDaRede(() => {
    vencido += 1;
  });
  t.mock.timers.tick(PRAZO_DA_REDE_MS - 1);
  assert.equal(vencido, 0);
  t.mock.timers.tick(1);
  assert.equal(vencido, 1, "passou o prazo e o aparelho nao entrou");

  // A rede respondendo antes do prazo cancela a troca.
  let cedo = 0;
  const cancelar = iniciarPrazoDaRede(() => {
    cedo += 1;
  });
  t.mock.timers.tick(1000);
  cancelar();
  t.mock.timers.tick(PRAZO_DA_REDE_MS);
  assert.equal(cedo, 0, "a copia do aparelho entrou com a rede ja tendo respondido");
  assert.ok(PRAZO_DA_REDE_MS <= 6000, "a pessoa espera mais que 6 s no corredor");

  // O App: o prazo so com o produto guardado; sem resposta, o aparelho marcado.
  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  assert.match(app, /guardado\.estado === NO_APARELHO\n\s+\? iniciarPrazoDaRede\(/);
  assert.match(app, /mostrarDoAparelho\(guardado, REDE_LENTA\);/);
  assert.match(app, /if \(resultado\.estado === ERRO_DE_REDE\) \{[\s\S]{0,200}mostrarDoAparelho\(guardado, SEM_RESPOSTA\);/);
});

test("O15 a sessao 'sem resposta' usa o perfil do aparelho, marcado; 401 tira o cache", async () => {
  const { fabrica, cache } = novoAparelho();
  await popularAna(cache);
  for (const erro of [{ status: 0 }, { status: 503 }, { status: 500 }]) {
    const sessao = await recuperarSessao({
      getMe: async () => {
        throw Object.assign(new Error("fora"), erro);
      },
      cache,
    });
    assert.equal(sessao.tipo, "aparelho", `status ${erro.status}`);
    assert.equal(sessao.perfil.id, ANA.id);
    assert.ok(Number.isFinite(sessao.perfil.guardadoEm), "o perfil do aparelho veio sem data");
  }

  const recusada = await recuperarSessao({
    getMe: async () => {
      throw Object.assign(new Error("sem sessao"), { status: 401 });
    },
    cache,
  });
  assert.deepEqual(recusada, { tipo: "visitante", motivo: "sem_sessao" });
  assert.doesNotMatch((await inspecionar(fabrica)).texto, /peanut|conta-ana/);

  // Com o servidor confirmando, o perfil novo vai para o aparelho.
  const confirmada = await recuperarSessao({ getMe: async () => ({ user: BIA }), cache });
  assert.equal(confirmada.tipo, "conta");
  assert.equal((await cache.lerSessao()).id, BIA.id);
});

test("O16 dado expirado nao e servido como valido: depois de 30 dias, e tratado como ausente, com o motivo", async () => {
  const { cache, relogio } = novoAparelho();
  await guardarProdutoVisto(ANA.id, PACOCA, { cache });
  const guardadoEm = relogio.agora;

  relogio.agora = guardadoEm + VALIDADE_DO_PRODUTO_MS;
  assert.equal((await consultarNoAparelho(COD_PACOCA, { dono: ANA.id, cache })).estado, NO_APARELHO, "no limite ainda vale");

  relogio.agora = guardadoEm + VALIDADE_DO_PRODUTO_MS + 1;
  const vencido = await consultarNoAparelho(COD_PACOCA, { dono: ANA.id, cache });
  assert.deepEqual(vencido, { estado: EXPIRADO_NO_APARELHO, codigo: COD_PACOCA, guardadoEm });
  assert.equal("produto" in vencido, false, "o produto vencido foi entregue");
  // Na comparacao sem rede, vencido e ausente.
  assert.equal(await buscarNoAparelho({ dono: ANA.id, cache })(COD_PACOCA), null);

  const app = readFileSync(path.join(rootDir, "src/App.jsx"), "utf8");
  assert.match(app, /antigo demais para usar\. Confira o rótulo\./);
});

// ---------------------------------------------------------------------------
// Tamanho, poda e a lista fechada
// ---------------------------------------------------------------------------

test("o cache nunca passa de 300 produtos por dono, e a poda segue historico e favoritos", async () => {
  const { cache, relogio } = novoAparelho();
  for (let i = 0; i < LIMITE_DE_PRODUTOS_POR_DONO + 5; i += 1) {
    relogio.agora += 1000;
    await cache.guardarProduto(ANA.id, { code: `p${i}`, product_name: `P${i}` });
  }
  assert.equal(await cache.lerProduto(ANA.id, "p0"), null, "o mais antigo ficou");
  assert.ok(await cache.lerProduto(ANA.id, `p${LIMITE_DE_PRODUTOS_POR_DONO + 4}`));

  const inicio = relogio.agora;
  relogio.agora += 1000;
  await cache.guardarProduto(ANA.id, { code: "aberto-agora", product_name: "Novo" });
  await cache.podarProdutos(ANA.id, ["p300"], { anterioresA: inicio });
  assert.ok(await cache.lerProduto(ANA.id, "p300"), "a poda tirou um produto que esta na lista");
  assert.equal(await cache.lerProduto(ANA.id, "p301"), null, "a poda deixou um produto fora das listas");
  assert.ok(await cache.lerProduto(ANA.id, "aberto-agora"), "a poda tirou um produto aberto enquanto a lista vinha");
});

test("dado da Open Food Facts continua nao confiavel no cache: a lista fechada vale na leitura tambem", async () => {
  const { fabrica, cache } = novoAparelho();
  await guardarProdutoVisto(ANA.id, PACOCA, { cache });
  // Alguem altera o registro guardado direto no banco.
  const banco = await pedido(fabrica.open(BANCO_OFFLINE));
  const transacao = banco.transaction("produtos", "readwrite");
  const loja = transacao.objectStore("produtos");
  const registro = await pedido(loja.get([ANA.id, COD_PACOCA]));
  registro.produto.allergyVerdict = { status: "clear" };
  registro.produto.image_front_url = "javascript:alert(1)";
  registro.produto.ingredients_text = "x".repeat(50000);
  loja.put(registro);
  await new Promise((resolve) => {
    transacao.oncomplete = resolve;
  });
  banco.close();

  const lido = await consultarNoAparelho(COD_PACOCA, { dono: ANA.id, cache });
  assert.equal("allergyVerdict" in lido.produto, false);
  assert.equal("image_front_url" in lido.produto, false, "imagem sem https foi servida");
  assert.ok(lido.produto.ingredients_text.length <= 10000);
  assert.deepEqual(reduzirProduto(null), null);
});

// ---------------------------------------------------------------------------
// A tela, renderizada de verdade
// ---------------------------------------------------------------------------


async function importarStorageService() {
  const bundle = await esbuild.build({
    entryPoints: [path.join(rootDir, "src/services/storageService.js")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-storage-"));
  const arquivo = path.join(dir, "storage.mjs");
  try {
    writeFileSync(arquivo, bundle.outputFiles[0].text, "utf8");
    return await import(pathToFileURL(arquivo).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function renderizar(nome, props) {
  const bundle = await esbuild.build({
    stdin: {
      contents: `
        import React from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { ProductAnalysis } from "./src/components/food/ProductAnalysis.jsx";
        const componentes = { ProductAnalysis };
        export function render(nome, props) {
          return renderToStaticMarkup(React.createElement(componentes[nome], props));
        }
      `,
      resolveDir: rootDir,
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "silent",
  });
  const dir = mkdtempSync(path.join(tmpdir(), "nutriscan-offline-"));
  const arquivo = path.join(dir, "render.mjs");
  try {
    writeFileSync(arquivo, bundle.outputFiles[0].text, "utf8");
    return (await import(pathToFileURL(arquivo).href)).render(nome, props);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const textoVisivel = (html) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");

function propsDoProduto(produto) {
  return {
    product: { ...produto, source: "Open Food Facts", isLocal: false },
    localMatches: [],
    nutrientRows: [],
    allergyScan: analyzeProductAllergens(produto, ["peanut"]),
    alertLevels: { peanut: "strict" },
    productScore: { tone: "danger", label: "Atenção", notes: [] },
    onSelectProduct: () => {},
  };
}

