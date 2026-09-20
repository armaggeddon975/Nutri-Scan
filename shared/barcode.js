// Validacao de codigo de barras de produto.
//
// POR QUE ISTO E CONTROLE DE SEGURANCA, E NAO POLIMENTO DE INTERFACE
//
// Num app de alergia, um digito digitado errado nao produz "nao encontrado".
// Produz OUTRO PRODUTO - que existe, esta cadastrado, tem foto, tem nome
// plausivel e tem outros alergenicos. A tela fica com cara de acerto e o
// conteudo errado.
//
// O digito verificador do EAN/UPC existe exatamente para isso: ele detecta
// todo erro de um unico digito e a maior parte das trocas de digitos vizinhos.
// Conferir esse digito antes de consultar a rede transforma a classe mais
// comum de erro de digitacao em uma mensagem clara em vez de um produto
// errado.
//
// O QUE ELE NAO RESOLVE
//
// O digito verificador nao prova que o usuario digitou o codigo que queria.
// Existem pares de codigos validos a um digito de distancia - trocar o ultimo
// digito e recalcular da outro codigo igualmente valido. A validacao reduz a
// classe de erro, nao a elimina, e a interface precisa continuar mostrando
// nome e marca do produto para que a pessoa confira o que veio.
//
// ONDE ESTE ARQUIVO VIVE, E POR QUE
//
// Em `shared/`, junto do motor deterministico, porque backend e frontend
// precisam usar a MESMA implementacao. Duas copias divergem com o tempo, e
// quando divergem a que vale e sempre a mais permissiva - que costuma ser a do
// servidor, justamente a que deveria ser a barreira.

export const FORMATO_EAN13 = "EAN-13";
export const FORMATO_EAN8 = "EAN-8";
export const FORMATO_UPCA = "UPC-A";

export const MOTIVO_VAZIO = "vazio";
export const MOTIVO_CARACTERE = "caractere_invalido";
export const MOTIVO_TAMANHO = "tamanho_invalido";
export const MOTIVO_DIGITO = "digito_verificador";

const TAMANHOS = new Map([
  [8, FORMATO_EAN8],
  [12, FORMATO_UPCA],
  [13, FORMATO_EAN13],
]);

// Separadores que aparecem quando alguem copia um codigo de uma embalagem ou
// de um site: espaco e hifen. Sao os UNICOS caracteres removidos, e a remocao
// e devolvida ao chamador para que a interface possa mostrar o que mudou.
//
// Nada alem disso e "limpado". Remover em silencio um caractere qualquer
// mudaria o codigo sem a pessoa perceber - que e exatamente o defeito que esta
// validacao existe para evitar.
const SEPARADORES = /[\s-]/g;

export function normalizarEntrada(entrada = "") {
  const original = String(entrada ?? "");
  const semSeparadores = original.replace(SEPARADORES, "");
  const removidos = original.length - semSeparadores.length;
  return { codigo: semSeparadores, removidos, original };
}

// Digito verificador do EAN/UPC: soma ponderada da direita para a esquerda,
// pesos 3 e 1 alternados, e o digito que completa a dezena.
//
// A ponderacao e feita a partir da DIREITA de proposito. Pela esquerda, os
// pesos de EAN-13 e EAN-8 sao diferentes entre si (1,3,1... contra 3,1,3...),
// e uma implementacao que fixa o peso inicial acerta um formato e erra o
// outro. Pela direita a regra e a mesma para os tres formatos.
export function calcularDigitoVerificador(digitosSemVerificador) {
  const digitos = String(digitosSemVerificador);
  let soma = 0;
  for (let i = digitos.length - 1, peso = 3; i >= 0; i -= 1, peso = peso === 3 ? 1 : 3) {
    soma += Number(digitos[i]) * peso;
  }
  return (10 - (soma % 10)) % 10;
}

export function digitoVerificadorConfere(codigo) {
  const corpo = codigo.slice(0, -1);
  const informado = Number(codigo[codigo.length - 1]);
  return calcularDigitoVerificador(corpo) === informado;
}

// UPC-A vira EAN-13 com um zero a esquerda.
//
// Os dois numeram o mesmo produto: UPC-A e o subconjunto norte-americano do
// EAN-13, e `0` + UPC-A e o EAN-13 correspondente. O digito verificador nao
// muda, porque o zero a esquerda nao altera a soma ponderada.
//
// A normalizacao acontece por um motivo nosso, nao da Open Food Facts: a
// deduplicacao de historico e favoritos e a restricao de unicidade
// `(user_id, product_code)`. Sem normalizar, o mesmo produto lido pela camera
// como EAN-13 e digitado pela pessoa como UPC-A viraria DUAS linhas de
// historico, e favoritar por um caminho nao apareceria como favoritado pelo
// outro.
export function upcaParaEan13(codigo) {
  return `0${codigo}`;
}

/**
 * Valida um codigo digitado ou lido.
 *
 * Devolve sempre um objeto, nunca lanca: quem chama precisa distinguir os
 * motivos de recusa para escolher a mensagem, e excecao nao carrega isso bem.
 *
 * `codigo` e a forma canonica - EAN-13 - quando valido. `codigoDigitado` e o
 * que a pessoa escreveu, sem separadores, para a interface poder mostrar.
 */
export function validarCodigoDeBarras(entrada) {
  const { codigo: semSeparadores, removidos } = normalizarEntrada(entrada);

  if (!semSeparadores) {
    return { valido: false, motivo: MOTIVO_VAZIO, removidos };
  }

  if (!/^\d+$/.test(semSeparadores)) {
    return { valido: false, motivo: MOTIVO_CARACTERE, removidos, codigoDigitado: semSeparadores };
  }

  const formato = TAMANHOS.get(semSeparadores.length);
  if (!formato) {
    return {
      valido: false,
      motivo: MOTIVO_TAMANHO,
      removidos,
      codigoDigitado: semSeparadores,
      tamanho: semSeparadores.length,
    };
  }

  if (!digitoVerificadorConfere(semSeparadores)) {
    return {
      valido: false,
      motivo: MOTIVO_DIGITO,
      removidos,
      codigoDigitado: semSeparadores,
      formato,
    };
  }

  const canonico = formato === FORMATO_UPCA ? upcaParaEan13(semSeparadores) : semSeparadores;

  return {
    valido: true,
    codigo: canonico,
    codigoDigitado: semSeparadores,
    formato,
    removidos,
    normalizado: canonico !== semSeparadores,
  };
}

// Mensagens de recusa.
//
// "digito verificador nao confere" e "produto nao encontrado" NAO podem virar
// a mesma frase. A primeira diz "confira o que voce digitou"; a segunda diz "o
// codigo esta certo, o produto e que nao esta na base". Colapsar as duas manda
// a pessoa procurar no lugar errado.
//
// O texto segue a regra do projeto para o publico do app: uma ideia por frase,
// e dizer o que fazer em vez de descrever o que houve.
export function mensagemDeRecusa(resultado) {
  switch (resultado?.motivo) {
    case MOTIVO_VAZIO:
      return "Digite o código de barras do produto.";
    case MOTIVO_CARACTERE:
      return "O código de barras tem só números. Confira o que você digitou.";
    case MOTIVO_TAMANHO:
      return (
        `Esse código tem ${resultado.tamanho} números. ` +
        "Um código de barras tem 8, 12 ou 13. Confira na embalagem."
      );
    case MOTIVO_DIGITO:
      return "Esse código não existe. Confira número por número na embalagem.";
    default:
      return "Não consegui ler esse código. Confira na embalagem.";
  }
}

// Usado pelo backend para decidir SE deve exigir digito verificador.
//
// A base da Open Food Facts tem cadastros com codigo alfanumerico, e a camera
// tambem le simbologias que nao sao EAN - Code-128 e QR, por exemplo. Esses
// codigos sao legitimos e nao tem digito verificador de EAN para conferir.
//
// A regra: so exige quando o codigo e todo numerico E tem um dos tres tamanhos
// de EAN/UPC. Nesse caso, um digito verificador errado nao tem explicacao
// inocente - e erro de digitacao ou adulteracao.
export function exigeDigitoVerificador(codigo) {
  const texto = String(codigo ?? "");
  return /^\d+$/.test(texto) && TAMANHOS.has(texto.length);
}
