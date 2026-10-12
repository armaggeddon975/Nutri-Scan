import { normalizeIntentText, normalizeText, termRegex } from "../../shared/text.js";

export { normalizeIntentText, normalizeText, termRegex };

export function cleanBarcode(value = "") {
  return value.replace(/[^\d]/g, "").slice(0, 18);
}

// O QUE A CAMERA LEU, SEM VIRAR OUTRO CODIGO
//
// Ate aqui a leitura da camera passava por `cleanBarcode`, que apaga TUDO que
// nao e digito e corta em 18. Para EAN isso nao muda nada. Mas o scanner tambem
// le CODE_128, que aceita letra: "AB7891000100103" virava "7891000100103" - um
// EAN valido de OUTRO produto, com outros alergenicos. Num app de alergia, o
// pior resultado possivel nao e "nao encontrado"; e o produto errado.
//
// A regra agora:
//   so digitos, espaco e hifen    os separadores saem, os digitos ficam - e o
//                                 caso de EAN, UPC, ITF e etiqueta de balanca
//   letras, digitos, . _ -        passa INTACTO. Na Open Food Facts vira "nao
//                                 encontrado", nunca outro produto. O backend
//                                 aceita esse mesmo conjunto
//   qualquer outra coisa          "", e a leitura e descartada
//
// Nada e cortado: um codigo maior que 64 caracteres e descartado inteiro, em vez
// de encurtado para um que talvez exista.
export const TAMANHO_MAXIMO_DO_CODIGO = 64;

export function codigoLidoPelaCamera(value = "") {
  const bruto = String(value).trim();
  if (!bruto) return "";

  if (/^[\d\s-]+$/.test(bruto)) {
    const digitos = bruto.replace(/[\s-]/g, "");
    return digitos.length <= TAMANHO_MAXIMO_DO_CODIGO ? digitos : "";
  }

  if (bruto.length <= TAMANHO_MAXIMO_DO_CODIGO && /^[A-Za-z0-9._-]+$/.test(bruto)) return bruto;

  return "";
}

export function isBarcodeQuery(value) {
  return /^\d{6,18}$/.test(cleanBarcode(value));
}

export function hasAnyTerm(query, terms) {
  const normalizedQuery = normalizeIntentText(query);

  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escapedTerm}(\\s|$)`).test(normalizedQuery);
  });
}

export function hasTextIntent(query, terms) {
  const haystack = normalizeIntentText(query);
  return terms.some((term) => {
    const normalizedTerm = normalizeIntentText(term);
    if (!normalizedTerm) return false;
    return termRegex(normalizedTerm).test(haystack);
  });
}
