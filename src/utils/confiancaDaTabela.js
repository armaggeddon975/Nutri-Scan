import { conferirFaixaDoTipo } from "./faixasPorCategoria.js";
import { getNutrientValue } from "./nutrition.js";

// SELO DE CONFIANCA DA TABELA NUTRICIONAL
//
// A tabela vem da Open Food Facts, que e colaborativa: medido em 06/11/2026
// nos 200 produtos mais lidos do Brasil, so 28,5% tinham todos os itens e 5%
// tinham conta que nao fecha. O app mostrava tudo do mesmo jeito.
//
// Este modulo NAO corrige numero e NAO diz qual valor e o certo - para produto
// embalado, quem sabe e o rotulo. Ele so diz se a tabela esta completa e se as
// contas dela batem, para o app avisar "confira a embalagem" quando nao.
//
// Le os valores do mesmo jeito que a tabela da tela (getNutrientValue), entao o
// selo fala dos numeros que a pessoa esta vendo.

export const CONFIANCA = {
  COMPLETA: "completa",
  INCOMPLETA: "incompleta",
  NAO_BATE: "nao-bate",
  SEM_TABELA: "sem-tabela",
};

// Os itens da tabela da tela que contam para "completa". Sal e sodio sao a
// mesma informacao: basta um dos dois.
export const ITENS_DA_TABELA = [
  { chave: "energy-kcal", nome: "energia" },
  { chave: "carbohydrates", nome: "carboidratos" },
  { chave: "sugars", nome: "açúcares" },
  { chave: "proteins", nome: "proteínas" },
  { chave: "fat", nome: "gorduras totais" },
  { chave: "saturated-fat", nome: "gorduras saturadas" },
  { chave: "fiber", nome: "fibras" },
  { chave: "sodium", nome: "sódio" },
];

// Folgas das contas. O rotulo arredonda cada numero, e a energia do rotulo pode
// usar fatores um pouco diferentes; as folgas existem para nao acusar
// arredondamento. Ver backend/tests/confiancaDaTabela.test.js.
const FOLGA_DA_ENERGIA = 0.2; // 20% da energia
const FOLGA_DA_ENERGIA_KCAL = 15; // ou 15 kcal, o que for maior
const FOLGA_KJ = 0.1; // kcal x kJ: 10%...
const FOLGA_KJ_MINIMA = 20; // ...ou 20 kJ (uns 5 kcal): bebida quase sem caloria arredonda muito
const FOLGA_DO_SAL = 0.1; // sal x sodio
const FOLGA_DA_PARTE_G = 0.5; // acucar dentro do carboidrato, saturada dentro da gordura
const LIMITE_DA_SOMA_G = 105; // em 100 g cabem 100 g, com folga de arredondamento

const KJ_POR_KCAL = 4.184;
const SAL_POR_SODIO = 2.5;

function valor(product, chave) {
  const numero = getNutrientValue(product, chave);
  return numero === null ? null : numero;
}

export function avaliarTabelaNutricional(product) {
  const kcal = valor(product, "energy-kcal");
  const kj = valor(product, "energy-kj");
  const carboidratos = valor(product, "carbohydrates");
  const acucares = valor(product, "sugars");
  const proteinas = valor(product, "proteins");
  const gorduras = valor(product, "fat");
  const saturadas = valor(product, "saturated-fat");
  const trans = valor(product, "trans-fat");
  const fibras = valor(product, "fiber");
  const poliois = valor(product, "polyols");
  const sal = valor(product, "salt");
  const sodioMg = valor(product, "sodium");
  const sodioG = sodioMg === null ? null : sodioMg / 1000;

  const presentes = {
    "energy-kcal": kcal,
    carbohydrates: carboidratos,
    sugars: acucares,
    proteins: proteinas,
    fat: gorduras,
    "saturated-fat": saturadas,
    fiber: fibras,
    sodium: sodioG ?? sal,
  };
  const faltando = ITENS_DA_TABELA.filter((item) => presentes[item.chave] === null).map((item) => item.nome);
  if (faltando.length === ITENS_DA_TABELA.length) {
    return { estado: CONFIANCA.SEM_TABELA, faltando, problemas: [] };
  }

  const problemas = [];
  const todos = [kcal, kj, carboidratos, acucares, proteinas, gorduras, saturadas, trans, fibras, sal, sodioMg];
  if (todos.some((numero) => numero !== null && numero < 0)) {
    problemas.push("Há um número negativo na tabela.");
  }

  // Energia: 4 kcal por grama de carboidrato e de proteina, 9 por grama de
  // gordura. Poliois (adocantes como o sorbitol) contam dentro do carboidrato
  // mas tem 2,4 kcal por grama. A fibra depende da convencao: na TACO o
  // carboidrato ja inclui a fibra; na Open Food Facts e no rotulo europeu ela
  // vem a parte, com 2 kcal por grama. Vale a conta que bater - so "nao bate"
  // quem fica longe das duas (o feijao da base local, que segue a TACO, foi
  // acusado a toa na primeira versao).
  if (kcal !== null && carboidratos !== null && proteinas !== null && gorduras !== null) {
    const semFibra = 4 * carboidratos + 4 * proteinas + 9 * gorduras - 1.6 * (poliois ?? 0);
    const comFibra = semFibra + 2 * (fibras ?? 0);
    const longe = (calculada) =>
      Math.abs(kcal - calculada) > Math.max(FOLGA_DA_ENERGIA_KCAL, FOLGA_DA_ENERGIA * Math.max(kcal, calculada));
    if (longe(semFibra) && longe(comFibra)) {
      problemas.push("A energia não confere com os carboidratos, as proteínas e as gorduras.");
    }
  }

  if (kcal !== null && kj !== null && kj > 0) {
    if (Math.abs(kj - KJ_POR_KCAL * kcal) > Math.max(FOLGA_KJ_MINIMA, FOLGA_KJ * kj)) {
      // A tabela da tela mostra so kcal; a frase nao cita kJ, que a pessoa nao ve.
      // Caso real: o Nescau 7891000412855 traz 86 kcal (de uma porcao) e 1.606 kJ
      // (de 100 g do po) - o kJ denuncia que a tabela "por 100 g" nao e de 100 g.
      problemas.push("A base traz dois valores diferentes para a energia.");
    }
  }

  if (sal !== null && sodioG !== null && sal > 0) {
    if (Math.abs(sal - SAL_POR_SODIO * sodioG) > Math.max(0.1, FOLGA_DO_SAL * sal)) {
      problemas.push("O sal e o sódio não conferem entre si.");
    }
  }

  if (acucares !== null && carboidratos !== null && acucares > carboidratos + FOLGA_DA_PARTE_G) {
    problemas.push("Os açúcares passam dos carboidratos.");
  }

  if (saturadas !== null && gorduras !== null && saturadas + (trans ?? 0) > gorduras + FOLGA_DA_PARTE_G) {
    problemas.push("As gorduras saturadas passam das gorduras totais.");
  }

  const soma = [carboidratos, proteinas, gorduras, fibras].reduce((total, numero) => total + (numero ?? 0), 0) + (sal ?? (sodioG ?? 0) * SAL_POR_SODIO);
  if (soma > LIMITE_DA_SOMA_G) {
    problemas.push("A soma dos nutrientes passa de 100 g.");
  }

  // Por ultimo, a faixa do tipo de produto (TACO): pega a tabela coerente
  // consigo mesma, mas de outra coisa - a do produto preparado no lugar do po.
  problemas.push(...conferirFaixaDoTipo(product).problemas);

  if (problemas.length) return { estado: CONFIANCA.NAO_BATE, faltando, problemas };
  if (faltando.length) return { estado: CONFIANCA.INCOMPLETA, faltando, problemas };
  return { estado: CONFIANCA.COMPLETA, faltando, problemas };
}

// "acucares e fibras", "acucares, fibras e sodio"
export function listarEmPortugues(itens) {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}
