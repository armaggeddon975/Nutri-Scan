// Confirmacao por leitura repetida.
//
// Um unico decode pode estar errado: quadro borrado, reflexo no plastico ou
// barra cortada produzem um codigo que passa pela validacao do ZXing e mesmo
// assim nao e o do produto. Num app de alergia, abrir o produto errado nao e um
// incomodo de interface — e informacao de seguranca errada na tela.
//
// A regra e simples: so aceita o codigo depois de le-lo duas vezes seguidas. Ao
// custo de ~100ms (uma tentativa a mais no laco do scanner), o erro aleatorio
// isolado deixa de virar resultado.
//
// Nao ha validacao de digito verificador aqui de proposito: EAN-8, EAN-13,
// UPC-A e UPC-E ja sao validados dentro do ZXing, que lanca ChecksumException
// quando o digito nao bate. Repetir a conta aqui so criaria falso negativo —
// o digito do UPC-E, por exemplo, e calculado sobre a forma expandida, e uma
// validacao ingenua de 8 digitos reprovaria leitura boa.

export const REQUIRED_HITS = 2;

export const EMPTY_CONFIRMATION = { candidate: "", hits: 0, confirmed: "" };

export function nextConfirmation(state, barcode, requiredHits = REQUIRED_HITS) {
  if (!barcode) return state;

  // Codigo diferente do anterior reinicia a contagem: a pessoa pode ter movido
  // a camera para outra embalagem no meio da leitura.
  if (state.candidate !== barcode) {
    return { candidate: barcode, hits: 1, confirmed: requiredHits <= 1 ? barcode : "" };
  }

  const hits = state.hits + 1;
  return { candidate: barcode, hits, confirmed: hits >= requiredHits ? barcode : "" };
}
