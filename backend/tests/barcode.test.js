import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  FORMATO_EAN13,
  FORMATO_EAN8,
  FORMATO_UPCA,
  MOTIVO_CARACTERE,
  MOTIVO_DIGITO,
  MOTIVO_TAMANHO,
  MOTIVO_VAZIO,
  calcularDigitoVerificador,
  digitoVerificadorConfere,
  exigeDigitoVerificador,
  mensagemDeRecusa,
  normalizarEntrada,
  upcaParaEan13,
  validarCodigoDeBarras,
} from "../../shared/barcode.js";
import { productRefSchema } from "../src/utils/validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");

// v0.7.3 - entrada manual de codigo de barras.
//
// A validacao de digito verificador NAO e polimento de interface. Num app de
// alergia, um digito digitado errado nao devolve "nao encontrado": devolve
// OUTRO PRODUTO, que existe, tem nome plausivel e tem outros alergenicos. A
// tela fica com cara de acerto e o conteudo errado.

// ---------------------------------------------------------------------------
// M1 - bateria de digito verificador
// ---------------------------------------------------------------------------

// Codigos reais, dos produtos que o proprio app ja usa como exemplo, mais um
// EAN-8 e um UPC-A conhecidos.
const VALIDOS = [
  ["3017624010701", FORMATO_EAN13, "Nutella"],
  ["5449000000996", FORMATO_EAN13, "Coca-Cola"],
  ["7891000100103", FORMATO_EAN13, "Leite Moca"],
  ["96385074", FORMATO_EAN8, "EAN-8 de referencia"],
  ["036000291452", FORMATO_UPCA, "UPC-A de referencia"],
];

test("M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos", () => {
  for (const [codigo, formato, rotulo] of VALIDOS) {
    const r = validarCodigoDeBarras(codigo);
    assert.equal(r.valido, true, `${rotulo} (${codigo}) foi recusado: ${r.motivo}`);
    assert.equal(r.formato, formato, `${rotulo} foi classificado como ${r.formato}`);
  }
});

test("M1 um digito trocado quebra o digito verificador", () => {
  // Para cada codigo valido, trocar UM digito de cada vez precisa ser
  // detectado. E essa a garantia que o digito verificador da, e e a classe de
  // erro mais comum ao digitar.
  for (const [codigo, , rotulo] of VALIDOS) {
    let detectados = 0;
    let total = 0;

    for (let i = 0; i < codigo.length; i += 1) {
      for (let d = 0; d <= 9; d += 1) {
        if (String(d) === codigo[i]) continue;
        total += 1;
        const mutado = `${codigo.slice(0, i)}${d}${codigo.slice(i + 1)}`;
        if (!validarCodigoDeBarras(mutado).valido) detectados += 1;
      }
    }

    assert.equal(
      detectados,
      total,
      `${rotulo}: ${total - detectados} de ${total} trocas de um digito passaram despercebidas`,
    );
  }
});

test("M1 codigos com digito verificador errado sao recusados pelo motivo certo", () => {
  for (const codigo of ["3017624010700", "5449000000997", "7891000100104", "96385075"]) {
    const r = validarCodigoDeBarras(codigo);
    assert.equal(r.valido, false, `${codigo} deveria ser recusado`);
    assert.equal(r.motivo, MOTIVO_DIGITO, `${codigo} recusado por ${r.motivo}`);
  }
});

// A parte mais importante de M1: provar que a validacao NAO basta.
test("M1 a validacao sozinha nao basta: existe vizinho valido a um digito", () => {
  const original = "7891000100103";

  // Trocar o ultimo digito e recalcular produz outro codigo VALIDO. Ou seja,
  // dois produtos diferentes podem estar a uma tecla de distancia, e o digito
  // verificador nao percebe.
  const corpoVizinho = "789100010011";
  const vizinho = `${corpoVizinho}${calcularDigitoVerificador(corpoVizinho)}`;

  assert.equal(validarCodigoDeBarras(original).valido, true);
  assert.equal(validarCodigoDeBarras(vizinho).valido, true, `${vizinho} deveria ser valido`);
  assert.notEqual(vizinho, original, "o vizinho precisa ser um codigo diferente");

  // E a consequencia de projeto: o codigo entregue a busca e EXATAMENTE o que
  // a pessoa digitou, nunca um corrigido ou aproximado. Se digitou o vizinho,
  // recebe o produto do vizinho - e a interface precisa mostrar nome e marca
  // para ela conferir. Nao existe "voce quis dizer".
  assert.equal(validarCodigoDeBarras(vizinho).codigo, vizinho);
  assert.equal(validarCodigoDeBarras(original).codigo, original);
});

test("M1 o calculo do digito bate com o digito publicado", () => {
  for (const [codigo, , rotulo] of VALIDOS) {
    const corpo = codigo.slice(0, -1);
    const esperado = Number(codigo[codigo.length - 1]);
    assert.equal(calcularDigitoVerificador(corpo), esperado, `${rotulo} (${codigo})`);
    assert.equal(digitoVerificadorConfere(codigo), true, rotulo);
  }
});

// ---------------------------------------------------------------------------
// M6 - "nao encontrado" e "digito invalido" sao coisas diferentes
// ---------------------------------------------------------------------------

test("M6 cada motivo de recusa tem mensagem propria", () => {
  const mensagens = new Map();

  for (const [entrada, motivo] of [
    ["", MOTIVO_VAZIO],
    ["abcdefgh", MOTIVO_CARACTERE],
    ["12345", MOTIVO_TAMANHO],
    ["3017624010700", MOTIVO_DIGITO],
  ]) {
    const r = validarCodigoDeBarras(entrada);
    assert.equal(r.motivo, motivo, `${JSON.stringify(entrada)} deu motivo ${r.motivo}`);

    const mensagem = mensagemDeRecusa(r);
    assert.ok(mensagem && mensagem.length > 0, `motivo ${motivo} ficou sem mensagem`);
    assert.ok(!mensagens.has(mensagem), `mensagem repetida entre motivos: "${mensagem}"`);
    mensagens.set(mensagem, motivo);
  }

  // A recusa por digito verificador NAO pode dizer "nao encontrado": uma manda
  // conferir o que foi digitado, a outra diz que o codigo esta certo e o
  // produto e que nao esta na base.
  const doDigito = mensagemDeRecusa(validarCodigoDeBarras("3017624010700"));
  assert.doesNotMatch(doDigito, /não está cadastrad|nao esta cadastrad|não encontrad/i);
  assert.match(doDigito, /confira/i, "a mensagem precisa dizer o que fazer");
});

// ---------------------------------------------------------------------------
// M7 - UPC-A normalizado para EAN-13 preserva a identidade
// ---------------------------------------------------------------------------

test("M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo", () => {
  const upca = "036000291452";
  const r = validarCodigoDeBarras(upca);

  assert.equal(r.valido, true);
  assert.equal(r.formato, FORMATO_UPCA);
  assert.equal(r.codigo, "0036000291452", "UPC-A deveria virar EAN-13");
  assert.equal(r.codigoDigitado, upca, "o que a pessoa digitou precisa ser preservado");
  assert.equal(r.normalizado, true);

  // O zero a esquerda nao muda a soma ponderada, entao o digito verificador do
  // EAN-13 resultante e o mesmo do UPC-A. Se nao fosse, a normalizacao estaria
  // inventando um codigo.
  assert.equal(digitoVerificadorConfere(r.codigo), true, "o EAN-13 gerado precisa ser valido");
  assert.equal(upcaParaEan13(upca), r.codigo);

  // E as duas formas convergem para a MESMA chave. Isso e o que impede o mesmo
  // produto de virar duas linhas de historico - a unicidade e
  // `(user_id, product_code)`.
  assert.equal(validarCodigoDeBarras("0036000291452").codigo, r.codigo);
});

// ---------------------------------------------------------------------------
// M8 - normalizacao visivel, sem alterar o codigo
// ---------------------------------------------------------------------------

test("M8 espaco e traco sao removidos, e a remocao e informada", () => {
  const r = validarCodigoDeBarras("789 1000-100103");

  assert.equal(r.valido, true);
  assert.equal(r.codigo, "7891000100103", "a remocao nao pode alterar o codigo");
  assert.equal(r.removidos, 2, "quem chama precisa saber quantos caracteres sairam");

  const { codigo, removidos, original } = normalizarEntrada("  301-762 4010701  ");
  assert.equal(codigo, "3017624010701");
  assert.equal(removidos, original.length - codigo.length);
});

test("M8 nenhum outro caractere e removido em silencio", () => {
  // Remover uma letra ou um ponto em silencio mudaria o codigo sem a pessoa
  // perceber - exatamente o defeito que esta validacao existe para evitar. O
  // certo e recusar e pedir conferencia.
  for (const entrada of ["3017.624010701", "30176240107O1", "3017624010701a", "+3017624010701"]) {
    const r = validarCodigoDeBarras(entrada);
    assert.equal(r.valido, false, `${entrada} deveria ser recusado, nao limpo`);
    assert.equal(r.motivo, MOTIVO_CARACTERE, `${entrada} deu motivo ${r.motivo}`);
  }
});

// ---------------------------------------------------------------------------
// M3 - o backend recusa codigo invalido
// ---------------------------------------------------------------------------

const PRODUTO_BASE = {
  productName: "Leite Condensado",
  productBrand: "Nestle",
  imageUrl: "https://images.openfoodfacts.org/exemplo.jpg",
};

test("M3 o backend recusa productCode com digito verificador invalido", () => {
  const resultado = productRefSchema.safeParse({
    ...PRODUTO_BASE,
    productCode: "7891000100104",
  });

  assert.equal(resultado.success, false, "o backend aceitou um codigo com digito errado");
  const mensagens = resultado.error.issues.map((i) => i.message).join(" | ");
  assert.match(mensagens, /dígito verificador/i, `mensagem inesperada: ${mensagens}`);
});

test("M3 o backend aceita productCode com digito verificador correto", () => {
  for (const [codigo] of VALIDOS) {
    const resultado = productRefSchema.safeParse({ ...PRODUTO_BASE, productCode: codigo });
    assert.equal(resultado.success, true, `o backend recusou o codigo valido ${codigo}`);
  }
});

test("M3 a regra do backend e estreita e nao quebra cadastro legitimo", () => {
  // A base da Open Food Facts tem codigo alfanumerico, e a camera le ITF-14 e
  // CODE_128. Nenhum desses tem digito verificador de EAN para conferir.
  // Exigir de todos transformaria um controle de seguranca em perda de
  // funcionalidade.
  for (const codigo of ["ABC123", "20003404_0001", "1234567890123456", "12345678901234", "1234567"]) {
    assert.equal(
      exigeDigitoVerificador(codigo),
      false,
      `${codigo} nao deveria exigir digito verificador`,
    );
    const resultado = productRefSchema.safeParse({ ...PRODUTO_BASE, productCode: codigo });
    assert.equal(resultado.success, true, `o backend recusou o codigo legitimo ${codigo}`);
  }

  // E exige exatamente nos tres tamanhos numericos de EAN/UPC.
  for (const codigo of ["96385074", "036000291452", "3017624010701"]) {
    assert.equal(exigeDigitoVerificador(codigo), true, `${codigo} deveria exigir`);
  }
});

// ---------------------------------------------------------------------------
// M9 - uma implementacao so, em shared/
// ---------------------------------------------------------------------------

test("M9 backend e frontend usam a MESMA implementacao de shared/", async () => {
  const backend = await readFile(path.join(rootDir, "backend/src/utils/validation.js"), "utf8");
  const frontend = await readFile(path.join(rootDir, "src/App.jsx"), "utf8");

  assert.match(
    backend,
    /from "\.\.\/\.\.\/\.\.\/shared\/barcode\.js"/,
    "o backend nao importa shared/barcode.js",
  );
  assert.match(
    frontend,
    /from "\.\.\/shared\/barcode\.js"/,
    "o frontend nao importa shared/barcode.js",
  );
});

test("M9 nao existe segunda implementacao do digito verificador", async () => {
  // Uma copia da regra em outro arquivo diverge com o tempo, e quando diverge a
  // que sobrevive e a mais permissiva - que costuma ser a do servidor,
  // justamente a que deveria ser a barreira.
  const arquivos = [
    "src/App.jsx",
    "src/utils/text.js",
    "src/pages/Scanner/ScannerPage.jsx",
    "src/pages/Search/SearchPage.jsx",
    "src/services/openFoodFactsService.js",
    "backend/src/utils/validation.js",
  ];

  for (const arquivo of arquivos) {
    const fonte = await readFile(path.join(rootDir, arquivo), "utf8");
    const codigo = fonte
      .split(/\r?\n/)
      .filter((linha) => !linha.trim().startsWith("//") && !linha.trim().startsWith("*"))
      .join("\n");

    assert.doesNotMatch(
      codigo,
      /function\s+calcularDigitoVerificador|function\s+digitoVerificadorConfere/,
      `${arquivo} tem uma copia da funcao de digito verificador`,
    );
    // A soma ponderada 3/1 e a assinatura do algoritmo. Se ela aparecer fora de
    // `shared/barcode.js`, alguem reimplementou.
    assert.doesNotMatch(
      codigo,
      /%\s*10\s*\)\s*%\s*10/,
      `${arquivo} parece reimplementar o calculo do digito verificador`,
    );
  }
});

// ---------------------------------------------------------------------------
// M12 - acessibilidade do campo
// ---------------------------------------------------------------------------

test("M12 o campo tem label associado e erro ligado por aria-describedby", async () => {
  const fonte = await readFile(path.join(rootDir, "src/pages/Scanner/ScannerPage.jsx"), "utf8");

  assert.match(fonte, /htmlFor=\{ID_CAMPO\}/, "o label nao esta associado ao campo");
  assert.match(fonte, /id=\{ID_CAMPO\}/, "o campo nao tem id");
  assert.match(fonte, /aria-describedby=\{descritores\.join\(" "\)\}/, "falta aria-describedby");
  assert.match(fonte, /aria-invalid=/, "falta aria-invalid");
  assert.match(fonte, /role="alert"/, "a mensagem de erro nao e anunciada");
  assert.match(fonte, /inputMode="numeric"/, "falta inputMode numerico");
  assert.match(fonte, /pattern="/, "falta pattern");

  // O erro so entra na lista de descritores quando existe: apontar para um id
  // ausente faz o leitor de tela anunciar nada.
  assert.match(fonte, /if \(temErro\) descritores\.push\(ID_ERRO\)/);
});

test("M12 o campo manual fica sempre visivel, nao escondido atras da camera", async () => {
  const fonte = await readFile(path.join(rootDir, "src/pages/Scanner/ScannerPage.jsx"), "utf8");

  // O formulario nao pode estar dentro do ramo `scannerState === "idle"` nem de
  // qualquer condicional de falha de camera: quem prefere digitar precisa dele
  // sempre, e quem teve a permissao negada precisa dele na hora.
  const inicioForm = fonte.indexOf('<form className="search-card"');
  assert.ok(inicioForm !== -1, "o formulario de codigo sumiu");

  const antes = fonte.slice(0, inicioForm);
  const aberturas = (antes.match(/\{scannerState === "idle" \? \(/g) || []).length;
  const fechamentos = (antes.match(/\)\}/g) || []).length;
  assert.ok(
    fechamentos >= aberturas,
    "o formulario de codigo parece estar dentro de um condicional de estado da camera",
  );
});

// ---------------------------------------------------------------------------
// N1 - canonicalizacao no schema do backend (v0.7.4)
// ---------------------------------------------------------------------------
//
// Ate a v0.7.3 o schema CONFERIA o digito verificador e gravava o codigo como
// veio. O modulo compartilhado documentava a normalizacao; o backend nao a
// aplicava. Estes testes cobrem o schema isoladamente; N1a a N1g, na suite de
// integracao, atravessam o banco.

function canonicoDoSchema(codigo) {
  const resultado = productRefSchema.safeParse({ ...PRODUTO_BASE, productCode: codigo });
  assert.equal(resultado.success, true, `${codigo} foi recusado pelo schema`);
  return resultado.data.productCode;
}

test("N1 o schema canonicaliza UPC-A para EAN-13", () => {
  assert.equal(canonicoDoSchema("036000291452"), "0036000291452");

  // E a forma canonica passa por ele inalterada: canonicalizar duas vezes da o
  // mesmo resultado, senao o valor mudaria a cada gravacao.
  assert.equal(canonicoDoSchema("0036000291452"), "0036000291452");
});

test("N1e o schema nao altera EAN-13 nem EAN-8", () => {
  for (const codigo of ["7891000100103", "5449000000996", "3017624010701", "96385074"]) {
    assert.equal(canonicoDoSchema(codigo), codigo, `${codigo} foi alterado`);
  }
});

test("N1d o schema nao altera codigo que nao e EAN/UPC", () => {
  // Canonicalizar um ITF-14 ou um codigo alfanumerico seria inventar um codigo
  // que nao existe. A isencao e a mesma que dispensa esses formatos do digito
  // verificador.
  for (const codigo of ["12345678901234", "20003404_0001", "ABC123", "1234567", "036000291452X"]) {
    const resultado = productRefSchema.safeParse({ ...PRODUTO_BASE, productCode: codigo });
    assert.equal(resultado.success, true, `${codigo} foi recusado`);
    assert.equal(resultado.data.productCode, codigo, `${codigo} foi alterado pela canonicalizacao`);
  }
});

test("N1 a canonicalizacao nao afrouxa a conferencia do digito", () => {
  // Um UPC-A com digito errado continua recusado. Canonicalizar antes de
  // conferir transformaria "12 digitos errados" em "13 digitos errados
  // aceitos".
  for (const codigo of ["036000291453", "7891000100104", "96385075"]) {
    const resultado = productRefSchema.safeParse({ ...PRODUTO_BASE, productCode: codigo });
    assert.equal(resultado.success, false, `${codigo} passou pelo schema`);
  }
});

test("N1 a canonicalizacao usa shared/barcode.js, sem copia local", async () => {
  const fonte = await readFile(path.join(rootDir, "backend/src/utils/validation.js"), "utf8");
  const codigo = fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");

  assert.match(codigo, /validarCodigoDeBarras/, "o schema nao usa a funcao compartilhada");

  // "Prefixa um zero" escrito a mao aqui seria a segunda implementacao.
  assert.doesNotMatch(codigo, /`0\$\{/, "o schema monta a forma canonica por conta propria");
  assert.doesNotMatch(codigo, /"0"\s*\+/, "o schema concatena o zero por conta propria");
  assert.doesNotMatch(codigo, /padStart\(\s*13/, "o schema normaliza por conta propria");
});
