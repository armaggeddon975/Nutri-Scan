// Cache de LEITURA para usar o app sem rede (v0.11.0).
//
// O supermercado e onde o sinal cai. Este modulo guarda no aparelho o que o app
// ja viu - o produto e o perfil de alergias -, para que a pessoa reveja um
// produto sem internet. Ele nao decide nada: e uma copia de leitura. Com rede,
// a fonte continua sendo a rede (o PostgreSQL e a Open Food Facts).
//
// POR QUE IndexedDB
//
// O `localStorage` e sincrono e pequeno: 300 produtos com ingredientes e tabela
// nutricional, lidos e reescritos a cada abertura, travariam a tela de um
// celular simples. IndexedDB e assincrono, guarda objeto estruturado e cabe
// muito mais. Cookie esta fora: iria para o servidor em toda requisicao.
//
// O QUE ENTRA - e so isto
//
//   produtos   os campos do produto que o motor e a tela leem (ver
//              CAMPOS_DO_PRODUTO), a data em que vieram da Open Food Facts
//   perfis     id e nome da conta, alergias e nivel de alerta
//   colecoes   as listas de historico e favoritos (so as referencias)
//   sessao     qual conta esta aberta neste aparelho
//
// O QUE NUNCA ENTRA
//
//   `allergyVerdict` - nem nenhum resultado do motor. O veredito depende do
//   perfil, que muda; um veredito guardado de semanas atras diria "sem
//   conflito" para quem marcou uma alergia ontem. Ele e RECALCULADO a cada
//   leitura, com o perfil atual (ver `offlineLookup.js`).
//   Senha, hash, salt, token de sessao, cookie, chave de API e e-mail - nenhum
//   deles e necessario para ler um rotulo sem rede.
//
// Tudo o que entra passa por uma lista FECHADA de campos, na escrita e de novo
// na leitura: dado da Open Food Facts continua nao confiavel por estar aqui.
//
// UM DONO POR REGISTRO
//
// Cada registro tem `dono`: o id da conta ou "visitante". Um aparelho guarda o
// cache de UMA conta por vez. Ao confirmar uma conta, o de qualquer outra e
// apagado; ao sair, o da conta sai inteiro.

export const BANCO_OFFLINE = "nutriscan-offline";
const VERSAO_DO_BANCO = 1;

export const VISITANTE = "visitante";

// Rotulo muda: receita reformulada e real, e para alergia ela importa. Passado
// este prazo, o produto guardado deixa de ser servido sem rede - a tela diz que
// o dado do aparelho esta velho e pede para conferir o rotulo.
export const VALIDADE_DO_PRODUTO_MS = 30 * 24 * 60 * 60 * 1000;

// Os limites do servidor: 100 no historico e 200 nos favoritos. O cache nunca
// passa da soma, por dono.
export const LIMITE_DE_PRODUTOS_POR_DONO = 300;

const LOJAS = {
  produtos: "produtos",
  perfis: "perfis",
  colecoes: "colecoes",
  sessao: "sessao",
};
const CHAVE_DA_SESSAO = "atual";

// Os campos que o motor de alergia e a tela do produto leem - os mesmos que o
// app pede a Open Food Facts. Nada fora desta lista e guardado.
export const CAMPOS_DO_PRODUTO = Object.freeze([
  "code",
  "product_name",
  "product_name_pt",
  "product_name_en",
  "brands",
  "quantity",
  "image_front_url",
  "ingredients_text",
  "ingredients_text_pt",
  "ingredients_text_en",
  "ingredients",
  "allergens",
  "allergens_tags",
  "traces",
  "traces_tags",
  "labels_tags",
  "categories_tags",
  "nutriments",
  "nutriscore_grade",
  "nutrition_grades",
  "nutrition_data_per",
  "serving_size",
]);

const MAX_TEXTO = 10000;
const MAX_ITENS_DE_LISTA = 200;
const MAX_TEXTO_DE_ITEM = 200;
const MAX_NUTRIENTES = 300;
const ALERTA_VALIDO = new Set(["standard", "strict"]);

function texto(valor, maximo = MAX_TEXTO) {
  return typeof valor === "string" ? valor.slice(0, maximo) : undefined;
}

function listaDeTextos(valor) {
  if (typeof valor === "string") return texto(valor);
  if (!Array.isArray(valor)) return undefined;
  return valor
    .filter((item) => typeof item === "string")
    .slice(0, MAX_ITENS_DE_LISTA)
    .map((item) => item.slice(0, MAX_TEXTO_DE_ITEM));
}

function nutrientes(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const saida = {};
  for (const [chave, item] of Object.entries(valor).slice(0, MAX_NUTRIENTES)) {
    if (typeof item === "number" && Number.isFinite(item)) saida[chave.slice(0, 100)] = item;
    else if (typeof item === "string") saida[chave.slice(0, 100)] = item.slice(0, 50);
  }
  return saida;
}

function imagemSegura(valor) {
  return typeof valor === "string" && valor.startsWith("https://") ? valor.slice(0, 1000) : undefined;
}

// A lista fechada. Roda na escrita E na leitura.
export function reduzirProduto(produto) {
  if (!produto || typeof produto !== "object") return null;
  const codigo = produto.code === undefined || produto.code === null ? "" : String(produto.code).trim();
  if (!codigo) return null;

  const reduzido = { code: codigo.slice(0, 64) };
  for (const campo of CAMPOS_DO_PRODUTO) {
    if (campo === "code") continue;
    let valor;
    if (campo === "nutriments") valor = nutrientes(produto.nutriments);
    else if (campo === "image_front_url") valor = imagemSegura(produto.image_front_url);
    else if (campo.endsWith("_tags")) valor = listaDeTextos(produto[campo]);
    else if (campo === "allergens" || campo === "traces") valor = listaDeTextos(produto[campo]);
    else valor = texto(produto[campo]);
    if (valor !== undefined) reduzido[campo] = valor;
  }
  return reduzido;
}

function referencia(item) {
  if (!item || typeof item.productCode !== "string" || !item.productCode) return null;
  const saida = {
    id: typeof item.id === "string" || typeof item.id === "number" ? String(item.id).slice(0, 100) : undefined,
    productCode: item.productCode.slice(0, 64),
    productName: texto(item.productName, 300) ?? null,
    productBrand: texto(item.productBrand, 200) ?? null,
    imageUrl: imagemSegura(item.imageUrl) ?? null,
  };
  if (typeof item.viewedAt === "string") saida.viewedAt = item.viewedAt.slice(0, 40);
  if (typeof item.createdAt === "string") saida.createdAt = item.createdAt.slice(0, 40);
  return saida;
}

function referencias(itens) {
  return (Array.isArray(itens) ? itens : []).map(referencia).filter(Boolean).slice(0, LIMITE_DE_PRODUTOS_POR_DONO);
}

// O perfil, so com o que a leitura sem rede precisa.
function perfilReduzido(usuario, guardadoEm, alergiasValidas) {
  const alergias = (Array.isArray(usuario.allergies) ? usuario.allergies : [])
    .filter((id) => typeof id === "string" && (!alergiasValidas || alergiasValidas.has(id)))
    .slice(0, 50);
  const niveis = {};
  const brutos = usuario.alertLevels && typeof usuario.alertLevels === "object" ? usuario.alertLevels : {};
  for (const id of alergias) {
    if (ALERTA_VALIDO.has(brutos[id])) niveis[id] = brutos[id];
  }
  return {
    dono: String(usuario.id),
    id: String(usuario.id),
    nome: texto(usuario.name, 120) ?? "",
    alergias,
    niveis,
    guardadoEm,
  };
}

function pedido(requisicao) {
  return new Promise((resolve, reject) => {
    requisicao.onsuccess = () => resolve(requisicao.result);
    requisicao.onerror = () => reject(requisicao.error);
  });
}

function concluida(transacao) {
  return new Promise((resolve, reject) => {
    transacao.oncomplete = () => resolve();
    transacao.onerror = () => reject(transacao.error);
    transacao.onabort = () => reject(transacao.error);
  });
}

/**
 * @param {object} opcoes
 * @param {IDBFactory} [opcoes.indexedDB]  injetavel para teste; no navegador,
 *                                         o `indexedDB` da pagina
 * @param {() => number} [opcoes.agora]
 * @param {Set<string>} [opcoes.alergiasValidas]  o catalogo do app
 */
export function criarCacheOffline({ indexedDB: fabrica, agora = () => Date.now(), nomeDoBanco = BANCO_OFFLINE, alergiasValidas } = {}) {
  const obterFabrica = () => fabrica ?? globalThis.indexedDB ?? null;

  function abrir() {
    const idb = obterFabrica();
    if (!idb) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      let requisicao;
      try {
        requisicao = idb.open(nomeDoBanco, VERSAO_DO_BANCO);
      } catch (erro) {
        reject(erro);
        return;
      }
      requisicao.onupgradeneeded = () => {
        const banco = requisicao.result;
        if (!banco.objectStoreNames.contains(LOJAS.produtos)) {
          const produtos = banco.createObjectStore(LOJAS.produtos, { keyPath: ["dono", "codigo"] });
          produtos.createIndex("porDono", "dono");
        }
        if (!banco.objectStoreNames.contains(LOJAS.perfis)) banco.createObjectStore(LOJAS.perfis, { keyPath: "dono" });
        if (!banco.objectStoreNames.contains(LOJAS.colecoes)) banco.createObjectStore(LOJAS.colecoes, { keyPath: "dono" });
        if (!banco.objectStoreNames.contains(LOJAS.sessao)) banco.createObjectStore(LOJAS.sessao, { keyPath: "chave" });
      };
      requisicao.onsuccess = () => resolve(requisicao.result);
      requisicao.onerror = () => reject(requisicao.error);
    });
  }

  // Abre, faz, fecha. Conexao aberta segurando o banco impediria o
  // `deleteDatabase` de emergencia de `apagarContas`.
  async function comBanco(lojas, modo, trabalho) {
    const banco = await abrir();
    if (!banco) return null;
    try {
      const transacao = banco.transaction(lojas, modo);
      // O aviso de fim e ligado ANTES do trabalho: uma transacao que termina
      // enquanto o trabalho ainda devolve o resultado nao pode passar batida.
      const fim = concluida(transacao);
      fim.catch(() => {});
      const resultado = await trabalho(transacao);
      await fim;
      return resultado;
    } finally {
      banco.close();
    }
  }

  async function guardarProduto(dono, produto) {
    const reduzido = reduzirProduto(produto);
    if (!dono || !reduzido) return false;
    await comBanco([LOJAS.produtos], "readwrite", async (transacao) => {
      const loja = transacao.objectStore(LOJAS.produtos);
      loja.put({ dono: String(dono), codigo: reduzido.code, guardadoEm: agora(), produto: reduzido });
      const doDono = await pedido(loja.index("porDono").getAll(String(dono)));
      const excedentes = doDono
        .sort((a, b) => b.guardadoEm - a.guardadoEm)
        .slice(LIMITE_DE_PRODUTOS_POR_DONO);
      for (const velho of excedentes) loja.delete([velho.dono, velho.codigo]);
    });
    return true;
  }

  // `codigo` ja na forma canonica (quem chama passa por `prepararCodigo`).
  async function lerProduto(dono, codigo) {
    if (!dono || !codigo) return null;
    const registro = await comBanco([LOJAS.produtos], "readonly", (transacao) =>
      pedido(transacao.objectStore(LOJAS.produtos).get([String(dono), String(codigo)])),
    );
    if (!registro) return null;
    const produto = reduzirProduto(registro.produto);
    if (!produto) return null;
    const guardadoEm = Number(registro.guardadoEm);
    return {
      produto,
      guardadoEm,
      expirado: !Number.isFinite(guardadoEm) || agora() - guardadoEm > VALIDADE_DO_PRODUTO_MS,
    };
  }

  // Mantem so os produtos que ainda estao no historico ou nos favoritos.
  // `anterioresA`: so apaga o que foi guardado ANTES da lista ser pedida - um
  // produto aberto enquanto a lista vinha nao some por ela estar velha.
  async function podarProdutos(dono, codigosMantidos, { anterioresA = Infinity } = {}) {
    if (!dono) return 0;
    const mantidos = new Set([...codigosMantidos].map(String));
    return comBanco([LOJAS.produtos], "readwrite", async (transacao) => {
      const loja = transacao.objectStore(LOJAS.produtos);
      const doDono = await pedido(loja.index("porDono").getAll(String(dono)));
      let apagados = 0;
      for (const registro of doDono) {
        if (!mantidos.has(registro.codigo) && registro.guardadoEm < anterioresA) {
          loja.delete([registro.dono, registro.codigo]);
          apagados += 1;
        }
      }
      return apagados;
    });
  }

  async function guardarColecoes(dono, { historico, favoritos }) {
    if (!dono) return false;
    await comBanco([LOJAS.colecoes], "readwrite", async (transacao) => {
      transacao.objectStore(LOJAS.colecoes).put({
        dono: String(dono),
        historico: referencias(historico),
        favoritos: referencias(favoritos),
        guardadoEm: agora(),
      });
    });
    return true;
  }

  async function lerColecoes(dono) {
    if (!dono) return null;
    const registro = await comBanco([LOJAS.colecoes], "readonly", (transacao) =>
      pedido(transacao.objectStore(LOJAS.colecoes).get(String(dono))),
    );
    if (!registro) return null;
    return {
      historico: referencias(registro.historico),
      favoritos: referencias(registro.favoritos),
      guardadoEm: Number(registro.guardadoEm),
    };
  }

  // A conta que o SERVIDOR acabou de confirmar. Grava o perfil dela, marca-a
  // como a sessao deste aparelho e apaga o cache de qualquer outra conta.
  async function guardarPerfil(usuario) {
    if (!usuario?.id) return false;
    const registro = perfilReduzido(usuario, agora(), alergiasValidas);
    await comBanco([LOJAS.produtos, LOJAS.perfis, LOJAS.colecoes, LOJAS.sessao], "readwrite", async (transacao) => {
      await apagarOutrasContas(transacao, registro.dono);
      transacao.objectStore(LOJAS.perfis).put(registro);
      transacao.objectStore(LOJAS.sessao).put({ chave: CHAVE_DA_SESSAO, dono: registro.dono });
    });
    return true;
  }

  async function lerPerfil(dono) {
    if (!dono || dono === VISITANTE) return null;
    const registro = await comBanco([LOJAS.perfis], "readonly", (transacao) =>
      pedido(transacao.objectStore(LOJAS.perfis).get(String(dono))),
    );
    return registro ? perfilReduzido({ id: registro.id, name: registro.nome, allergies: registro.alergias, alertLevels: registro.niveis }, Number(registro.guardadoEm), alergiasValidas) : null;
  }

  // A conta que estava aberta neste aparelho, com o perfil guardado - ou null.
  async function lerSessao() {
    const sessao = await comBanco([LOJAS.sessao], "readonly", (transacao) =>
      pedido(transacao.objectStore(LOJAS.sessao).get(CHAVE_DA_SESSAO)),
    );
    if (!sessao?.dono) return null;
    return lerPerfil(sessao.dono);
  }

  async function apagarOutrasContas(transacao, manter) {
    for (const nome of [LOJAS.perfis, LOJAS.colecoes]) {
      const loja = transacao.objectStore(nome);
      const chaves = await pedido(loja.getAllKeys());
      for (const chave of chaves) {
        if (chave !== VISITANTE && chave !== manter) loja.delete(chave);
      }
    }
    const produtos = transacao.objectStore(LOJAS.produtos);
    const chaves = await pedido(produtos.getAllKeys());
    for (const chave of chaves) {
      if (chave[0] !== VISITANTE && chave[0] !== manter) produtos.delete(chave);
    }
  }

  // Sair da conta, conta excluida, sessao recusada pelo servidor: o cache de
  // TODA conta sai do aparelho - perfil, listas, produtos e a marca de sessao.
  // O do visitante fica: e dele, e nunca veio de uma conta.
  //
  // Se a limpeza fina falhar, o banco inteiro e apagado. Perder o cache do
  // visitante e um custo pequeno perto de deixar o perfil de alergias de quem
  // saiu num aparelho compartilhado.
  async function apagarContas() {
    try {
      await comBanco([LOJAS.produtos, LOJAS.perfis, LOJAS.colecoes, LOJAS.sessao], "readwrite", async (transacao) => {
        await apagarOutrasContas(transacao, null);
        transacao.objectStore(LOJAS.sessao).delete(CHAVE_DA_SESSAO);
      });
      return true;
    } catch {
      const idb = obterFabrica();
      if (!idb) return false;
      await pedido(idb.deleteDatabase(nomeDoBanco)).catch(() => {});
      return false;
    }
  }

  return {
    guardarProduto,
    lerProduto,
    podarProdutos,
    guardarColecoes,
    lerColecoes,
    guardarPerfil,
    lerPerfil,
    lerSessao,
    apagarContas,
  };
}
