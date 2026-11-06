// FAIXAS POR TIPO DE PRODUTO, A PARTIR DA TACO (pedido do dono em 06/11/2026)
//
// Fonte dos numeros: NEPA-UNICAMP, Tabela Brasileira de Composicao de Alimentos
// (TACO), 4a edicao revisada e ampliada - planilha oficial Taco-4a-Edicao.xlsx,
// abas "CMVCol taco3" (energia, carboidrato, proteina, lipideos) e "AGtaco3"
// (acidos graxos saturados), lida em 06/11/2026 de nepa.unicamp.br. O proprio
// documento diz: "E permitida a reproducao total ou parcial do material, desde
// que seja citada a fonte."
//
// Os numeros sao por 100 g e foram copiados da planilha por script, sem
// digitacao ("Tr", traco, virou 0; "NA" e "*" ficaram null), arredondados como
// na tabela impressa: kcal inteira, gramas com uma casa. Cada tipo de
// produto aponta para um ou mais alimentos da TACO; a faixa usa o menor e o
// maior deles. Quem decide o tipo e a categoria que a Open Food Facts da ao
// produto (`categories_tags`), nunca o nome ou a marca.
//
// Por que estes 12: sao os que tem categoria clara na OFF e alimento
// equivalente na TACO, e incluem os que a medicao contra a foto do rotulo
// achou errados (achocolatado e leite em po com a coluna do produto preparado,
// maionese com zero de saturada). Refrigerante ficou de fora: a versao zero
// tem 0 kcal e daria alarme falso.
//
// Regras de categoria ajustadas pela primeira passada nos 200 produtos mais
// lidos (06/11/2026), antes de qualquer outro uso:
// - "en:cocoa-and-chocolate-powders" sozinha tambem cobre CACAU em po puro
//   (348 kcal, 23 g de proteina - normal para cacau): achocolatado passa a
//   exigir tambem bebida instantanea ou preparo de bebida.
// - torrone ("en:turron") vem marcado como wafer recheado na OFF e fica fora.

export const FONTE_DAS_FAIXAS = "TACO - Tabela Brasileira de Composição de Alimentos, 4ª edição revisada e ampliada (NEPA-UNICAMP)";

export const FAIXAS_TACO = [
  {
    chave: "achocolatado-em-po",
    nome: "achocolatado em pó",
    categorias: { qualquer: ["en:instant-chocolate-powders"], ou: { umaDe: ["en:cocoa-and-chocolate-powders", "pt:achocolatados"], eUmaDe: ["en:instant-beverages", "en:beverage-preparations"] } },
    referencias: [
      { taco: 491, alimento: "Achocolatado, pó", kcal: 401, carboidratos: 91.2, proteinas: 4.2, gorduras: 2.2, saturadas: 1.1 },
    ],
  },
  {
    chave: "leite-em-po",
    nome: "leite em pó",
    categorias: {"qualquer":["en:milk-powders"]},
    referencias: [
      { taco: 456, alimento: "Leite, de vaca, desnatado, pó", kcal: 362, carboidratos: 53, proteinas: 34.7, gorduras: 0.9, saturadas: 0.6 },
      { taco: 459, alimento: "Leite, de vaca, integral, pó", kcal: 497, carboidratos: 39.2, proteinas: 25.4, gorduras: 26.9, saturadas: 16.3 },
    ],
  },
  {
    chave: "leite-condensado",
    nome: "leite condensado",
    categorias: {"qualquer":["en:condensed-milks"]},
    referencias: [
      { taco: 453, alimento: "Leite, condensado", kcal: 313, carboidratos: 57, proteinas: 7.7, gorduras: 6.7, saturadas: 4.2 },
    ],
  },
  {
    chave: "creme-de-leite",
    nome: "creme de leite",
    categorias: {"qualquer":["en:creams"]},
    referencias: [
      { taco: 447, alimento: "Creme de Leite", kcal: 221, carboidratos: 4.5, proteinas: 1.5, gorduras: 22.5, saturadas: 11.8 },
    ],
  },
  {
    chave: "requeijao",
    nome: "requeijão",
    categorias: {"qualquer":["pt:requeijao-cremoso","pt:requeijao"]},
    referencias: [
      { taco: 468, alimento: "Queijo, requeijão, cremoso", kcal: 257, carboidratos: 2.4, proteinas: 9.6, gorduras: 23.4, saturadas: 13.7 },
    ],
  },
  {
    chave: "maionese",
    nome: "maionese",
    categorias: {"qualquer":["en:mayonnaises"]},
    referencias: [
      { taco: 524, alimento: "Maionese, tradicional com ovos", kcal: 302, carboidratos: 7.9, proteinas: 0.6, gorduras: 30.5, saturadas: 4.1 },
    ],
  },
  {
    chave: "margarina",
    nome: "margarina",
    categorias: {"qualquer":["en:margarines"]},
    referencias: [
      { taco: 263, alimento: "Margarina, com óleo hidrogenado, com sal (65% de lipídeos)", kcal: 596, carboidratos: 0, proteinas: 0, gorduras: 67.4, saturadas: 14.9 },
      { taco: 264, alimento: "Margarina, com óleo hidrogenado, sem sal (80% de lipídeos)", kcal: 723, carboidratos: 0, proteinas: 0, gorduras: 81.7, saturadas: null },
      { taco: 265, alimento: "Margarina, com óleo interesterificado, com sal (65%de lipídeos)", kcal: 594, carboidratos: 0, proteinas: 0, gorduras: 67.2, saturadas: 21.9 },
      { taco: 266, alimento: "Margarina, com óleo interesterificado, sem sal (65% de lipídeos)", kcal: 593, carboidratos: 0, proteinas: 0, gorduras: 67.1, saturadas: 20.9 },
    ],
  },
  {
    chave: "azeite",
    nome: "azeite",
    categorias: {"qualquer":["en:olive-oils"]},
    referencias: [
      { taco: 260, alimento: "Azeite, de oliva, extra virgem", kcal: 884, carboidratos: null, proteinas: null, gorduras: 100, saturadas: 14.9 },
    ],
  },
  {
    chave: "oleo-vegetal",
    nome: "óleo vegetal",
    categorias: {"qualquer":["en:soybean-oils","en:sunflower-oils","en:rapeseed-oils","en:canola-oils","en:corn-oils"]},
    referencias: [
      { taco: 268, alimento: "Óleo, de canola", kcal: 884, carboidratos: null, proteinas: null, gorduras: 100, saturadas: 7.9 },
      { taco: 269, alimento: "Óleo, de girassol", kcal: 884, carboidratos: null, proteinas: null, gorduras: 100, saturadas: 10.8 },
      { taco: 270, alimento: "Óleo, de milho", kcal: 884, carboidratos: null, proteinas: null, gorduras: 100, saturadas: 15.2 },
      { taco: 272, alimento: "Óleo, de soja", kcal: 884, carboidratos: null, proteinas: null, gorduras: 100, saturadas: 15.2 },
    ],
  },
  {
    chave: "pao-de-forma",
    nome: "pão de forma",
    categorias: {"qualquer":["en:sliced-breads"]},
    referencias: [
      { taco: 48, alimento: "Pão, aveia, forma", kcal: 343, carboidratos: 59.6, proteinas: 12.4, gorduras: 5.7, saturadas: 1.1 },
      { taco: 49, alimento: "Pão, de soja", kcal: 309, carboidratos: 56.5, proteinas: 11.3, gorduras: 3.6, saturadas: 0.7 },
      { taco: 50, alimento: "Pão, glúten, forma", kcal: 253, carboidratos: 44.1, proteinas: 12, gorduras: 2.7, saturadas: 0.5 },
      { taco: 51, alimento: "Pão, milho, forma", kcal: 292, carboidratos: 56.4, proteinas: 8.3, gorduras: 3.1, saturadas: 0.6 },
      { taco: 52, alimento: "Pão, trigo, forma, integral", kcal: 253, carboidratos: 49.9, proteinas: 9.4, gorduras: 3.7, saturadas: 0.7 },
    ],
  },
  {
    chave: "biscoito-recheado",
    nome: "biscoito recheado",
    categorias: {"qualquer":["en:filled-biscuits"]},
    referencias: [
      { taco: 9, alimento: "Biscoito, doce, recheado com chocolate", kcal: 472, carboidratos: 70.5, proteinas: 6.4, gorduras: 19.6, saturadas: 6.2 },
      { taco: 10, alimento: "Biscoito, doce, recheado com morango", kcal: 471, carboidratos: 71, proteinas: 5.7, gorduras: 19.6, saturadas: 6.1 },
    ],
  },
  {
    chave: "wafer-recheado",
    nome: "wafer recheado",
    categorias: { qualquer: ["en:stuffed-wafers", "en:wafers"], exceto: ["en:turron"] },
    referencias: [
      { taco: 11, alimento: "Biscoito, doce, wafer, recheado de chocolate", kcal: 502, carboidratos: 67.5, proteinas: 5.6, gorduras: 24.7, saturadas: 6.5 },
      { taco: 12, alimento: "Biscoito, doce, wafer, recheado de morango", kcal: 513, carboidratos: 67.4, proteinas: 4.5, gorduras: 26.4, saturadas: 6.7 },
    ],
  },
];
