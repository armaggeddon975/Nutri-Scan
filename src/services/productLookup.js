import { mensagemDeRecusa, validarCodigoDeBarras } from "../../shared/barcode.js";
import { fetchProductByBarcode } from "./openFoodFactsService.js";
import { cleanBarcode } from "../utils/text.js";

// Consulta de produto por codigo.
//
// POR QUE ESTE MODULO EXISTE
//
// Ate a v0.7.2 este passo vivia dentro de `App.jsx`, no meio de um
// `useCallback`. Funcionava, mas nao podia ser executado por teste sem montar
// React, e o projeto nao tem renderizador nos testes. O resultado era que o
// CAMINHO PRINCIPAL DO PRODUTO - o que decide qual alimento a pessoa esta
// vendo - nunca tinha sido exercitado.
//
// Extrair nao cria um caminho paralelo: cria o unico caminho, agora nomeado.
// `App.jsx` chama esta funcao, o gate E2E chama esta funcao, e os testes
// chamam esta funcao. Se houvesse duas, a divergencia entre elas seria
// invisivel ate alguem se machucar com ela.
//
// A CONFERENCIA DE ENTRADA DEPENDE DA ORIGEM, A CONSULTA NAO
//
// "manual"  a pessoa digitou. Exige EAN-13, EAN-8 ou UPC-A com digito
//           verificador correto, ANTES de qualquer requisicao de rede.
// "camera"  a @zxing decodificou. Nao reconfere digito verificador, por dois
//           motivos: a biblioteca ja confere o checksum da simbologia ao
//           decodificar - e por isso `ChecksumException` esta na lista de
//           erros transitorios do scanner -, e o leitor aceita ITF e CODE_128,
//           que nao tem digito verificador de EAN. Exigir um aqui recusaria
//           caixa de papelao e etiqueta de balanca, que sao leituras validas.
//
// Depois desse passo os dois seguem identicos: mesma busca, mesmo produto,
// mesmo motor deterministico, mesmo veredito.

export const CODIGO_INVALIDO = "codigo_invalido";
export const NAO_ENCONTRADO = "nao_encontrado";
export const ERRO_DE_REDE = "erro_de_rede";
export const ENCONTRADO = "encontrado";

export const ORIGEM_MANUAL = "manual";
export const ORIGEM_CAMERA = "camera";

/**
 * @param {string} entrada        o que a pessoa digitou ou a camera leu
 * @param {object} opcoes
 * @param {string} opcoes.origem  ORIGEM_MANUAL (padrao) ou ORIGEM_CAMERA
 * @param {Function} opcoes.buscar  injetavel para teste; em producao e a
 *                                  consulta real a Open Food Facts
 */
export async function consultarProdutoPorCodigo(
  entrada,
  { origem = ORIGEM_MANUAL, buscar = fetchProductByBarcode } = {},
) {
  let codigo;

  if (origem === ORIGEM_MANUAL) {
    const validacao = validarCodigoDeBarras(entrada);
    if (!validacao.valido) {
      // Retorno ANTES de qualquer chamada a `buscar`. Consultar a rede e
      // decidir depois ja seria tarde: um digito errado nao devolve "nao
      // encontrado", devolve outro produto, com outros alergenicos.
      return {
        estado: CODIGO_INVALIDO,
        motivo: validacao.motivo,
        mensagem: mensagemDeRecusa(validacao),
        codigoDigitado: validacao.codigoDigitado ?? "",
      };
    }

    // A forma canonica sai daqui para a consulta a Open Food Facts, que NAO
    // passa pelo nosso backend - entao este e o unico lugar onde ela pode ser
    // decidida para a busca.
    //
    // Para o que vai ao BANCO, porem, quem decide e o servidor. Ate a v0.7.3
    // nao era assim: o backend so conferia o digito verificador e gravava o
    // codigo como viesse, entao um UPC-A lido pela camera - que nao passa por
    // este ramo - virava uma segunda linha de historico do mesmo produto. Era o
    // defeito N1.
    //
    // A canonicalizacao daqui continua existindo por conveniencia: a tela
    // mostra o que sera buscado, e a consulta externa usa a forma certa. Ela
    // nao e mais a que garante a unicidade no banco.
    codigo = validacao.codigo;
  } else {
    codigo = cleanBarcode(entrada);
    if (!codigo) {
      return {
        estado: CODIGO_INVALIDO,
        motivo: "vazio",
        mensagem: mensagemDeRecusa({ motivo: "vazio" }),
        codigoDigitado: "",
      };
    }
  }

  try {
    const produto = await buscar(codigo);
    if (!produto) return { estado: NAO_ENCONTRADO, codigo };
    return { estado: ENCONTRADO, codigo, produto };
  } catch (erro) {
    return { estado: ERRO_DE_REDE, codigo, erro };
  }
}
