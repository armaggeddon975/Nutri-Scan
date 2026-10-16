import { analyzeProductAllergens } from "../../shared/allergenEngine.js";
import { VALID_ALLERGY_IDS } from "../../shared/allergens.js";
import { applyAllergyAuthority, buildAllergyVerdict, PROFILE_SOURCE } from "../../shared/allergyVerdict.js";
import { criarCacheOffline } from "./offlineCache.js";
import { CODIGO_INVALIDO, identidadeDoCodigo, ORIGEM_MANUAL, prepararCodigo } from "./productLookup.js";

// Leitura SEM REDE (v0.11.0).
//
// Este modulo nao busca produto. Ele so le o que o aparelho ja guardou - e
// nunca adivinha: nada de produto por prefixo de codigo, por marca ou por
// semelhanca. Num app de alergia, produto aproximado e produto errado. O codigo
// pedido existe no aparelho, exatamente, ou a resposta e "nao disponivel
// offline".

export const NO_APARELHO = "no_aparelho";
export const NAO_DISPONIVEL_OFFLINE = "nao_disponivel_offline";
export const EXPIRADO_NO_APARELHO = "expirado_no_aparelho";

// Por que o dado do aparelho apareceu - a tela diz isso a pessoa.
export const SEM_INTERNET = "sem_internet"; // o navegador diz que esta offline
export const SEM_RESPOSTA = "sem_resposta"; // ha rede, a Open Food Facts nao respondeu
export const REDE_LENTA = "rede_lenta"; // passou o prazo; a resposta ainda pode chegar

// "Online mas sem resposta": a consulta por codigo insiste tres vezes, ate 8 s
// cada. Com o produto guardado, a pessoa nao espera tudo isso no corredor -
// passado este prazo, ve o que o aparelho tem, marcado, e a tela troca pela
// versao da internet se ela chegar.
export const PRAZO_DA_REDE_MS = 6000;

// O cache deste aparelho, com o catalogo de alergias do app.
export const cacheDoAparelho = criarCacheOffline({ alergiasValidas: VALID_ALLERGY_IDS });

export function semInternet() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// A chave do produto no aparelho: a forma canonica, a mesma regra que o
// backend aplica antes de gravar. Um UPC-A digitado acha o EAN-13 guardado.
export function chaveDoProduto(codigo) {
  return identidadeDoCodigo(String(codigo ?? "").trim());
}

/**
 * Consulta UM produto no aparelho.
 *
 * O codigo passa ANTES pela mesma conferencia da consulta com rede
 * (`prepararCodigo`: digito verificador de `shared/barcode.js`, UPC-A para
 * EAN-13, codigo nao-EAN intacto). Codigo invalido e recusado sem olhar o cache.
 */
export async function consultarNoAparelho(entrada, { origem = ORIGEM_MANUAL, dono, cache = cacheDoAparelho } = {}) {
  const preparado = prepararCodigo(entrada, origem);
  if (preparado.estado === CODIGO_INVALIDO) return preparado;

  const codigo = chaveDoProduto(preparado.codigo);
  let registro = null;
  try {
    registro = await cache.lerProduto(dono, codigo);
  } catch {
    registro = null;
  }

  if (!registro) return { estado: NAO_DISPONIVEL_OFFLINE, codigo };
  if (registro.expirado) return { estado: EXPIRADO_NO_APARELHO, codigo, guardadoEm: registro.guardadoEm };
  return {
    estado: NO_APARELHO,
    codigo,
    guardadoEm: registro.guardadoEm,
    produto: { ...registro.produto, source: "Open Food Facts", isLocal: false },
  };
}

// Para a comparacao sem rede: a mesma assinatura da busca da Open Food Facts
// (`buscar(codigo) -> produto | null`), lendo o aparelho. Dado expirado volta
// como ausente.
export function buscarNoAparelho({ dono, cache = cacheDoAparelho } = {}) {
  return async (codigo) => {
    const registro = await cache.lerProduto(dono, chaveDoProduto(codigo)).catch(() => null);
    if (!registro || registro.expirado) return null;
    return { ...registro.produto, source: "Open Food Facts", isLocal: false, guardadoEm: registro.guardadoEm };
  };
}

// Guarda o produto que a pessoa ABRIU com internet. So produto da Open Food
// Facts com codigo: o da base local ja vem no app.
export async function guardarProdutoVisto(dono, produto, { cache = cacheDoAparelho } = {}) {
  if (!dono || !produto?.code || produto.isLocal) return false;
  try {
    return await cache.guardarProduto(dono, { ...produto, code: chaveDoProduto(produto.code) });
  } catch {
    // Sem armazenamento, o app segue: so nao havera copia para usar sem rede.
    return false;
  }
}

/**
 * O veredito de um produto lido do aparelho, RECALCULADO agora.
 *
 * O mesmo motor de `shared/` (`analyzeProductAllergens` e `buildAllergyVerdict`)
 * e a mesma barreira (`applyAllergyAuthority`, que impoe o piso). O perfil e o
 * que o aparelho tem AGORA - nunca um guardado junto com o produto, que la nao
 * existe.
 */
export function avaliarNoAparelho(produto, { profileAllergies = [], alertLevels = {} } = {}) {
  const scan = analyzeProductAllergens(produto, profileAllergies);
  const verdict = buildAllergyVerdict({
    profileRisks: scan.profileRisks,
    profileAllergies,
    hasProductContext: Boolean(produto),
    profileSource: PROFILE_SOURCE.request,
    alertLevels,
    allergenDataAvailable: scan.hasData,
  });
  const final = applyAllergyAuthority({ safety: "normal" }, verdict);
  return { scan, safety: final.safety, allergyVerdict: final.allergyVerdict };
}

// Com o produto no aparelho, o prazo da rede. Devolve a funcao que o cancela.
export function iniciarPrazoDaRede(aoVencer, { prazoMs = PRAZO_DA_REDE_MS, relogio = globalThis } = {}) {
  const id = relogio.setTimeout(aoVencer, prazoMs);
  return () => relogio.clearTimeout(id);
}

export function dataDoAparelho(guardadoEm) {
  const data = new Date(guardadoEm);
  if (Number.isNaN(data.getTime())) return "data desconhecida";
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
