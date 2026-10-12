// Validacao por mutacao.
//
// Um teste que passa nao prova nada sozinho: ele pode estar verificando algo
// que e verdade independentemente do codigo sob teste. A unica forma de saber
// que um teste PROTEGE uma propriedade e quebrar a propriedade de proposito e
// exigir que o teste fique vermelho.
//
// Cada entrada abaixo injeta um defeito real no codigo, roda os testes que
// deveriam pega-lo e EXIGE falha. Se a mutacao passar despercebida, o script
// termina em erro: o teste correspondente e decorativo.
//
// O codigo original e restaurado sempre, inclusive se o processo for
// interrompido.
//
// Uso:
//   node scripts/mutation-check.js              so as mutacoes sem banco
//   node scripts/mutation-check.js --com-banco  inclui as que exigem PostgreSQL

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const comBanco = process.argv.includes("--com-banco");

const LIMITADOR = "backend/src/middleware/rateLimit.js";
const REPO_HISTORICO = "backend/src/repositories/historyRepository.js";
const REPO_FAVORITOS = "backend/src/repositories/favoritesRepository.js";

const BARCODE = "shared/barcode.js";
const VEREDITO = "shared/allergyVerdict.js";
const LOOKUP = "src/services/productLookup.js";
const APP = "src/App.jsx";
const VALIDACAO_BACKEND = "backend/src/utils/validation.js";
const MIGRATION003 = "backend/migrations/003_canonicaliza_upca.js";
const ENV_BACKEND = "backend/src/config/env.js";
const ERRO_BACKEND = "backend/src/middleware/errorMiddleware.js";
const APP_BACKEND = "backend/src/app.js";
const VERSION_CHECK = "scripts/version-check.js";
const VERIFY_DEPLOY = "scripts/verify-deploy.js";
const RENDER_YAML = "render.yaml";

const SUITE_BARCODE = "tests/barcode.test.js";
const SUITE_LOOKUP = "tests/productLookup.test.js";
const SUITE_LIMITE = "tests/rateLimit.test.js";
const SUITE_INTEGRACAO = "tests/collectionsIntegration.test.js";
const SUITE_PRODUCAO = "tests/productionHardening.test.js";
const SUITE_DEPLOY = "tests/verifyDeploy.test.js";
const SUITE_RENDER = "tests/renderSync.test.js";
const SUITE_CORPO = "tests/bodyParseError.test.js";

const COMPOSICAO = "  return [porUsuario, porIp];";

const MUTACOES = [
  {
    id: "T1",
    requisito: "P2",
    descricao: "FRONTEND_ORIGIN deixa de ser obrigatoria em producao",
    arquivo: ENV_BACKEND,
    de: '  "DATABASE_SSL",\n  "FRONTEND_ORIGIN",\n  "TRUST_PROXY",',
    para: '  "DATABASE_SSL",\n  "TRUST_PROXY",',
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta",
    banco: false,
  },
  {
    id: "T1b",
    requisito: "P2",
    descricao: "FRONTEND_ORIGIN volta a ter default de localhost em producao",
    arquivo: ENV_BACKEND,
    de: '(NODE_ENV === "production" ? "" : DEFAULT_FRONTEND_ORIGIN_DEV)',
    para: "DEFAULT_FRONTEND_ORIGIN_DEV",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost",
    banco: false,
  },
  {
    id: "T2",
    requisito: "P5",
    descricao: "o handler de erro passa a incluir err.stack na resposta",
    arquivo: ERRO_BACKEND,
    de: "      ...(!isProduction() ? { details: error.message } : {}),",
    para: "      details: error.stack,",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P5 erro do driver do banco nao chega ao cliente",
    banco: false,
  },
  {
    id: "T2b",
    requisito: "P5",
    descricao: "o handler de erro para de registrar o detalhe no log",
    arquivo: ERRO_BACKEND,
    de: '  console.error("[erro interno]", error);',
    para: "  void error;",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P5 o detalhe do erro vai para o log do servidor",
    banco: false,
  },
  {
    id: "T3",
    requisito: "P9",
    descricao: "DATABASE_SSL ausente passa a usar o default false em producao",
    arquivo: ENV_BACKEND,
    de: '  "DATABASE_URL",\n  "DATABASE_SSL",\n  "FRONTEND_ORIGIN",',
    para: '  "DATABASE_URL",\n  "FRONTEND_ORIGIN",',
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual",
    banco: false,
  },
  {
    id: "T3b",
    requisito: "P9",
    descricao: "valor booleano nao reconhecido volta a cair no default",
    arquivo: ENV_BACKEND,
    de: "    if (presente(fonte[variavel]) && !booleanoReconhecido(fonte[variavel])) {",
    para: "    if (false) {",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P9 valor booleano nao reconhecido nao cai em default silencioso",
    banco: false,
  },
  {
    id: "T4",
    requisito: "P12",
    descricao: "verify:deploy compara versao com includes em vez de igualdade",
    arquivo: VERSION_CHECK,
    de: "  if (local !== remota) {",
    para: "  if (!String(remota).includes(local)) {",
    suite: SUITE_DEPLOY,
    deveQuebrar: "P12 versao no ar diferente da do repositorio reprova o D1",
    banco: false,
  },
  {
    id: "T5",
    requisito: "P13",
    descricao: "verify:deploy manda o POST do D6 para uma rota de escrita",
    arquivo: VERIFY_DEPLOY,
    de: "  const { resposta, texto } = await cliente.requisitar(SONDA_INEXISTENTE, {",
    para: '  const { resposta, texto } = await cliente.requisitar("/api/auth/login", {',
    suite: SUITE_DEPLOY,
    deveQuebrar: "P13 o registro de requisicoes do verify:deploy nao tem escrita",
    banco: false,
  },
  {
    id: "T5b",
    requisito: "P13",
    descricao: "o D5 passa a sondar autenticacao com POST de logout",
    arquivo: VERIFY_DEPLOY,
    de: '  for (const caminho of ["/api/auth/me", "/api/history", "/api/favorites", "/api/profile"]) {\n    const { resposta } = await cliente.requisitar(caminho);',
    para:
      '  for (const caminho of ["/api/auth/me", "/api/history", "/api/favorites", "/api/profile"]) {\n' +
      '    await cliente.requisitar("/api/auth/logout", { method: "POST" });\n' +
      "    const { resposta } = await cliente.requisitar(caminho);",
    suite: SUITE_DEPLOY,
    deveQuebrar: "P13 contra o roteador REAL, nenhuma rota de escrita e alcancada",
    banco: false,
  },
  {
    id: "T6",
    requisito: "P3",
    descricao: "o CORS passa a refletir a origem do request",
    arquivo: APP_BACKEND,
    de: "      origin: env.frontendOrigin || false,",
    para: "      origin: true,",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P3 CORS devolve a origem configurada, nunca a do request",
    banco: false,
  },
  {
    id: "T7",
    requisito: "P4",
    descricao: "o app deixa de confiar no proxy em producao",
    arquivo: APP_BACKEND,
    de: '  if (env.trustProxy) app.set("trust proxy", 1);',
    para: "  void env.trustProxy;",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha",
    banco: false,
  },
  {
    id: "T8",
    requisito: "P11",
    descricao: "NOT_EXECUTED passa a contar como aprovacao no agregado",
    arquivo: VERIFY_DEPLOY,
    // Na primeira rodada este mutante SOBREVIVEU: o teste so exercitava o fluxo
    // real, em que NOT_EXECUTED (D8) vem sempre junto do FAIL do D7. A regra foi
    // isolada em `agregar` e testada com sete PASS e um NOT_EXECUTED.
    de: "  return resultados.length === SUBGATES.length && resultados.every((r) => r.estado === PASS);",
    para: "  return resultados.every((r) => r.estado !== FAIL);",
    suite: SUITE_DEPLOY,
    deveQuebrar: "P11 NOT_EXECUTED nao conta como PASS no agregado",
    banco: false,
  },
  {
    id: "T9",
    requisito: "P11",
    descricao: "o verify:deploy sai com codigo 0 mesmo com subgate reprovado",
    arquivo: VERIFY_DEPLOY,
    de: "  process.exitCode = saida.aprovado ? 0 : 1;",
    para: "  process.exitCode = 0;",
    suite: SUITE_DEPLOY,
    deveQuebrar: "P11 o comando de verdade sai com codigo 1 quando um subgate falha",
    banco: false,
  },
  // --- v0.7.6 ------------------------------------------------------------------
  {
    id: "V1",
    requisito: "S1/S4",
    descricao: "obrigatoria nova no codigo, sem entrada no render.yaml",
    arquivo: ENV_BACKEND,
    de: '  "TRUST_PROXY",\n];',
    para: '  "TRUST_PROXY",\n  "SESSION_COOKIE_NAME",\n];',
    suite: SUITE_RENDER,
    deveQuebrar: "S1 render.yaml contem todas as obrigatorias de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO",
    banco: false,
  },
  {
    id: "V1b",
    requisito: "S2",
    descricao: "o render.yaml ganha uma variavel que o codigo nao le",
    arquivo: RENDER_YAML,
    de: '      - key: SESSION_TTL_DAYS\n        value: "30"',
    para: '      - key: SESSION_TTL_DAYS\n        value: "30"\n      - key: VARIAVEL_MORTA\n        value: "x"',
    suite: SUITE_RENDER,
    deveQuebrar: "S2 render.yaml nao declara variavel que o codigo nao le",
    banco: false,
  },
  {
    id: "V1c",
    requisito: "S3",
    descricao: "a DATABASE_URL ganha valor literal no render.yaml",
    arquivo: RENDER_YAML,
    de: "      - key: DATABASE_URL\n        sync: false",
    para: '      - key: DATABASE_URL\n        value: "postgresql://usuario:senha@host.exemplo/banco"',
    suite: SUITE_RENDER,
    deveQuebrar: "S3 nenhuma credencial com valor literal no render.yaml",
    banco: false,
  },
  {
    id: "V2",
    requisito: "O2a",
    descricao: "o handler volta a devolver 500 para JSON malformado",
    arquivo: ERRO_BACKEND,
    de: "  if (ehFalhaDeParseDoCorpo(error)) {",
    para: "  if (false) {",
    suite: SUITE_CORPO,
    deveQuebrar: "O2a JSON malformado responde 400, nao 500 - a medicao do auditor",
    banco: false,
  },
  {
    id: "V3",
    requisito: "O2d",
    descricao: "o handler passa a confiar no statusCode de qualquer erro",
    arquivo: ERRO_BACKEND,
    de: "  if (ehFalhaDeParseDoCorpo(error)) {\n    return res.status(400).json({",
    para:
      "  if (error.expose === true && (error.status || error.statusCode)) {\n" +
      "    return res.status(error.status || error.statusCode).json({",
    suite: SUITE_CORPO,
    deveQuebrar: "O2d erro de biblioteca com statusCode arbitrario nao escolhe o status",
    banco: false,
  },
  {
    id: "V3b",
    requisito: "O2d",
    descricao: "basta copiar o type do body-parser para ganhar 400",
    arquivo: ERRO_BACKEND,
    de: '  return error instanceof SyntaxError && error.type === "entity.parse.failed";',
    para: '  return error.type === "entity.parse.failed";',
    suite: SUITE_CORPO,
    deveQuebrar: "O2d copiar o type do body-parser nao basta para ganhar 400",
    banco: false,
  },
  {
    id: "V4",
    requisito: "R7",
    descricao: "o verify:deploy passa a chamar POST /api/history",
    arquivo: VERIFY_DEPLOY,
    de: "  const { resposta, texto } = await cliente.requisitar(SONDA_INEXISTENTE, {",
    para: '  const { resposta, texto } = await cliente.requisitar("/api/history", {',
    suite: SUITE_DEPLOY,
    deveQuebrar: "P13 o registro de requisicoes do verify:deploy nao tem escrita",
    banco: false,
  },
  {
    id: "S1",
    requisito: "N1a",
    descricao: "remove o .transform() do productCodeSchema (o defeito N1)",
    arquivo: VALIDACAO_BACKEND,
    de: "  .transform(canonicalizarCodigo);",
    para: "  .transform((valor) => valor);",
    suite: SUITE_BARCODE,
    deveQuebrar: "N1 o schema canonicaliza UPC-A para EAN-13",
    banco: false,
  },
  {
    id: "S1b",
    requisito: "N1a",
    descricao: "canonicaliza so no frontend: o banco volta a guardar o que veio",
    arquivo: VALIDACAO_BACKEND,
    de: "  .transform(canonicalizarCodigo);",
    para: "  .transform((valor) => valor);",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "N1a o mesmo produto em UPC-A e EAN-13 vira UMA linha canonica",
    banco: true,
  },
  {
    id: "S1c",
    requisito: "N1c",
    descricao: "sem transform, a requisicao direta grava a forma de 12 digitos",
    arquivo: VALIDACAO_BACKEND,
    de: "  .transform(canonicalizarCodigo);",
    para: "  .transform((valor) => valor);",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "N1c requisicao DIRETA ao backend grava a forma canonica",
    banco: true,
  },
  {
    id: "S2",
    requisito: "N1e",
    descricao: "prefixa zero tambem no EAN-8, nao so no UPC-A",
    arquivo: BARCODE,
    de: "  const canonico = formato === FORMATO_UPCA ? upcaParaEan13(semSeparadores) : semSeparadores;",
    para: "  const canonico = formato !== FORMATO_EAN13 ? upcaParaEan13(semSeparadores) : semSeparadores;",
    suite: SUITE_BARCODE,
    deveQuebrar: "N1e o schema nao altera EAN-13 nem EAN-8",
    banco: false,
  },
  {
    id: "S2b",
    requisito: "N1d",
    descricao: "remove a isencao: todo codigo passa pela canonicalizacao",
    arquivo: VALIDACAO_BACKEND,
    de: "  if (!exigeDigitoVerificador(valor)) return valor;",
    para: '  if (!exigeDigitoVerificador(valor)) return String(valor).padStart(13, "0");',
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "N1d codigo nao-EAN passa intacto pela canonicalizacao",
    banco: true,
  },
  {
    id: "S3",
    requisito: "N1g",
    descricao: "a migration deixa sobreviver a linha NAO canonica",
    arquivo: MIGRATION003,
    de: "    await client.query(`DELETE FROM ${tabela} WHERE id = $1`, [linha.id]);",
    para: "    await client.query(`DELETE FROM ${tabela} WHERE id = $1`, [existente.rows[0].id]);",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "N1g a migration funde as duas formas pela regra declarada",
    banco: true,
  },
  {
    id: "S4",
    requisito: "N1g",
    descricao: "a migration para de conferir o digito antes de canonicalizar",
    arquivo: MIGRATION003,
    de: "    if (!resultado.valido) continue;",
    para: "    if (false) continue;",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "N1g a migration e idempotente e nao toca codigo nao-EAN",
    banco: true,
  },
  {
    id: "S5",
    requisito: "R2",
    descricao: "o digito verificador do backend passa a aceitar tudo",
    arquivo: BARCODE,
    de:
      "export function digitoVerificadorConfere(codigo) {\n" +
      "  const corpo = codigo.slice(0, -1);\n" +
      "  const informado = Number(codigo[codigo.length - 1]);\n" +
      "  return calcularDigitoVerificador(corpo) === informado;\n" +
      "}",
    para: "export function digitoVerificadorConfere(codigo) {\n  return Boolean(codigo);\n}",
    suite: SUITE_BARCODE,
    deveQuebrar: "N1 a canonicalizacao nao afrouxa a conferencia do digito",
    banco: false,
  },
  {
    id: "S6",
    requisito: "N1",
    descricao: "o schema monta a forma canonica por conta propria",
    arquivo: VALIDACAO_BACKEND,
    de: "  return resultado.valido ? resultado.codigo : valor;",
    para: '  return valor.length === 12 ? `0${valor}` : valor;',
    suite: SUITE_BARCODE,
    deveQuebrar: "N1 a canonicalizacao usa shared/barcode.js, sem copia local",
    banco: false,
  },
  {
    id: "P1",
    requisito: "M1",
    descricao: "o digito verificador passa a aceitar qualquer codigo",
    arquivo: BARCODE,
    de:
      "export function digitoVerificadorConfere(codigo) {\n" +
      "  const corpo = codigo.slice(0, -1);\n" +
      "  const informado = Number(codigo[codigo.length - 1]);\n" +
      "  return calcularDigitoVerificador(corpo) === informado;\n" +
      "}",
    para: "export function digitoVerificadorConfere(codigo) {\n  return Boolean(codigo);\n}",
    suite: SUITE_BARCODE,
    deveQuebrar: "M1 codigos com digito verificador errado sao recusados pelo motivo certo",
    banco: false,
  },
  {
    id: "P1b",
    requisito: "M1",
    descricao: "o calculo do digito verificador usa peso fixo pela esquerda",
    arquivo: BARCODE,
    de: "  for (let i = digitos.length - 1, peso = 3; i >= 0; i -= 1, peso = peso === 3 ? 1 : 3) {",
    para: "  for (let i = 0, peso = 1; i < digitos.length; i += 1, peso = peso === 3 ? 1 : 3) {",
    suite: SUITE_BARCODE,
    deveQuebrar: "M1 codigos validos de EAN-13, EAN-8 e UPC-A sao aceitos",
    banco: false,
  },
  {
    id: "P2",
    requisito: "M3",
    descricao: "tira a validacao do backend e deixa so no frontend",
    arquivo: VALIDACAO_BACKEND,
    de:
      "  .refine(\n" +
      "    (valor) => !exigeDigitoVerificador(valor) || digitoVerificadorConfere(valor),\n" +
      '    "Código do produto tem dígito verificador inválido.",\n' +
      "  )",
    para: '  .refine(() => true, "Código do produto tem dígito verificador inválido.")',
    suite: SUITE_BARCODE,
    deveQuebrar: "M3 o backend recusa productCode com digito verificador invalido",
    banco: false,
  },
  {
    id: "P2b",
    requisito: "M3",
    descricao: "a regra do backend passa a exigir digito verificador de TODO codigo",
    arquivo: BARCODE,
    de: "  return /^\\d+$/.test(texto) && TAMANHOS.has(texto.length);",
    para: "  return true;",
    suite: SUITE_BARCODE,
    deveQuebrar: "M3 a regra do backend e estreita e nao quebra cadastro legitimo",
    banco: false,
  },
  {
    id: "P3",
    requisito: "M4",
    descricao: "o caminho manual monta o resultado por conta propria",
    arquivo: APP,
    de: "      const resultado = await consultarProdutoPorCodigo(nextQuery, { origem });",
    para:
      "      const resultado = {\n" +
      "        estado: \"encontrado\",\n" +
      "        codigo: nextQuery,\n" +
      "        produto: await fetchProductByBarcode(nextQuery),\n" +
      "      };",
    suite: SUITE_LOOKUP,
    deveQuebrar: "o caminho manual nao monta o resultado por conta propria",
    banco: false,
  },
  {
    id: "P3b",
    requisito: "M4",
    descricao: "o caminho manual deixa de conferir a entrada e vira o da camera",
    arquivo: LOOKUP,
    de: "    const validacao = validarCodigoDeBarras(entrada);",
    para: "    const validacao = { valido: true, codigo: cleanBarcode(entrada) };",
    suite: SUITE_LOOKUP,
    deveQuebrar: "M2 codigo invalido nao chega a rede",
    banco: false,
  },
  {
    id: "P4",
    requisito: "M5",
    descricao: "remove o piso de risco do veredito",
    arquivo: VEREDITO,
    de: "    minimumSafety: status === VERDICT_STATUS.conflict ? CONFLICT_MINIMUM_SAFETY : null,",
    para: "    minimumSafety: null,",
    suite: SUITE_LOOKUP,
    deveQuebrar: "M5 o piso de risco vale no caminho manual",
    banco: false,
  },
  {
    id: "P5",
    requisito: "M9",
    descricao: "o frontend ganha copia propria da funcao de digito verificador",
    arquivo: APP,
    de: 'import { validarCodigoDeBarras } from "../shared/barcode.js";',
    para:
      "function calcularDigitoVerificador(digitos) {\n" +
      "  let soma = 0;\n" +
      "  for (let i = digitos.length - 1, peso = 3; i >= 0; i -= 1, peso = peso === 3 ? 1 : 3) {\n" +
      "    soma += Number(digitos[i]) * peso;\n" +
      "  }\n" +
      "  return (10 - (soma % 10)) % 10;\n" +
      "}\n" +
      'import { validarCodigoDeBarras } from "../shared/barcode.js";',
    suite: SUITE_BARCODE,
    deveQuebrar: "M9 nao existe segunda implementacao do digito verificador",
    banco: false,
  },
  {
    id: "P5b",
    requisito: "M9",
    descricao: "o backend para de importar a validacao compartilhada",
    arquivo: VALIDACAO_BACKEND,
    // A ancora nomeia a lista de imports inteira, entao ela precisa ser
    // atualizada quando um import novo entra - foi o que aconteceu na v0.7.4,
    // com `validarCodigoDeBarras`. O script acusou INAPLICAVEL em vez de passar
    // batido, que e o modo de falhar certo: ele diz que nao conseguiu testar,
    // em vez de dizer que testou.
    de:
      "import {\n" +
      "  digitoVerificadorConfere,\n" +
      "  exigeDigitoVerificador,\n" +
      "  validarCodigoDeBarras,\n" +
      '} from "../../../shared/barcode.js";',
    para:
      "const digitoVerificadorConfere = () => true;\n" +
      "const exigeDigitoVerificador = () => false;\n" +
      "const validarCodigoDeBarras = (v) => ({ valido: true, codigo: v });",
    suite: SUITE_BARCODE,
    deveQuebrar: "M9 backend e frontend usam a MESMA implementacao de shared/",
    banco: false,
  },
  {
    id: "P6",
    requisito: "M7",
    descricao: "UPC-A deixa de normalizar para EAN-13",
    arquivo: BARCODE,
    de: "  const canonico = formato === FORMATO_UPCA ? upcaParaEan13(semSeparadores) : semSeparadores;",
    para: "  const canonico = semSeparadores;",
    suite: SUITE_BARCODE,
    deveQuebrar: "M7 UPC-A vira EAN-13 com zero a esquerda, e o produto e o mesmo",
    banco: false,
  },
  {
    id: "P7",
    requisito: "M6",
    descricao: "colapsa digito invalido e nao encontrado na mesma mensagem",
    arquivo: BARCODE,
    de: '      return "Esse código não existe. Confira número por número na embalagem.";',
    para: '      return "Digite o código de barras do produto.";',
    suite: SUITE_BARCODE,
    deveQuebrar: "M6 cada motivo de recusa tem mensagem propria",
    banco: false,
  },
  {
    id: "P8",
    requisito: "M8",
    descricao: "passa a limpar qualquer caractere em silencio, nao so espaco e traco",
    arquivo: BARCODE,
    de: "const SEPARADORES = /[\\s-]/g;",
    para: "const SEPARADORES = /[^\\d]/g;",
    suite: SUITE_BARCODE,
    deveQuebrar: "M8 nenhum outro caractere e removido em silencio",
    banco: false,
  },
  {
    id: "P9",
    requisito: "M10",
    descricao: "remove a validacao do backend: codigo invalido chega ao banco",
    arquivo: VALIDACAO_BACKEND,
    de:
      "  .refine(\n" +
      "    (valor) => !exigeDigitoVerificador(valor) || digitoVerificadorConfere(valor),\n" +
      '    "Código do produto tem dígito verificador inválido.",\n' +
      "  )",
    para: '  .refine(() => true, "Código do produto tem dígito verificador inválido.")',
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "M10 o backend recusa gravar codigo com digito verificador invalido",
    banco: true,
  },
  {
    id: "N1",
    requisito: "R1/R3",
    descricao: "remove o teto por IP e deixa so o de usuario (o defeito E1)",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porUsuario];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R1 usuario dentro do teto mas IP estourado recebe 429",
    banco: false,
  },
  {
    id: "N1b",
    requisito: "R3",
    descricao: "remove o teto por IP: multiplas contas voltam a passar sem limite",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porUsuario];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP",
    banco: false,
  },
  {
    id: "N2",
    requisito: "R2",
    descricao: "remove o teto por usuario e deixa so o de IP (o defeito D1)",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porIp];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R2 IP dentro do teto mas usuario estourado recebe 429",
    banco: false,
  },
  {
    id: "N2b",
    requisito: "R4",
    descricao: "remove o teto por usuario: vizinhos de NAT voltam a se derrubar",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porIp];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R4 dois usuarios atras do MESMO IP mantem cotas separadas",
    banco: false,
  },
  {
    id: "N3",
    requisito: "R4",
    descricao: "confere o IP antes do usuario: recusas passam a gastar cota do IP",
    arquivo: LIMITADOR,
    de: COMPOSICAO,
    para: "  return [porIp, porUsuario];",
    suite: SUITE_LIMITE,
    deveQuebrar: "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP",
    banco: false,
  },
  {
    id: "N4",
    requisito: "R5",
    descricao: "le o balde de IP de um cabecalho do request",
    arquivo: LIMITADOR,
    de:
      "export function collectionsIpRateLimitKey(req) {\n" +
      "  return `ip:${normalizarIp(req?.ip)}`;\n" +
      "}",
    para:
      "export function collectionsIpRateLimitKey(req) {\n" +
      '  return `ip:${normalizarIp(req?.get?.("x-real-ip") ?? req?.ip)}`;\n' +
      "}",
    suite: SUITE_LIMITE,
    deveQuebrar: "R5 dados forjados no request nao conseguem balde de IP novo",
    banco: false,
  },
  {
    id: "N5",
    requisito: "R5",
    descricao: "para de normalizar IPv6: um bloco /64 vira 2^64 baldes",
    arquivo: LIMITADOR,
    de: '  return `${grupos.slice(0, 4).map((g) => g || "0").join(":")}::/64`;',
    para: "  return semZona;",
    suite: SUITE_LIMITE,
    deveQuebrar: "R5 um bloco IPv6 /64 nao vira infinitos baldes",
    banco: false,
  },
  {
    id: "M1",
    requisito: "R6",
    descricao: "afrouxa o teto de autenticacao de 40 para 100 por janela",
    arquivo: LIMITADOR,
    de: "  limit: 40,",
    para: "  limit: 100,",
    suite: SUITE_LIMITE,
    deveQuebrar: "R6 os tres tetos por rota seguem nos valores declarados",
    banco: false,
  },
  {
    id: "M2",
    requisito: "R7",
    descricao: "derruba o teto por IP para um valor que quebraria a suite",
    arquivo: LIMITADOR,
    de: "export const TETO_COLECOES_POR_IP = 3000;",
    para: "export const TETO_COLECOES_POR_IP = 300;",
    suite: SUITE_LIMITE,
    deveQuebrar: "R7 o teto por IP esta no valor medido",
    banco: false,
  },
  {
    id: "M3",
    requisito: "Q3",
    descricao: "cria um bypass por variavel de ambiente",
    arquivo: LIMITADOR,
    de: "    keyGenerator: collectionsRateLimitKey,",
    para:
      '    skip: () => process.env.RATE_LIMIT_OFF === "1",\n' +
      "    keyGenerator: collectionsRateLimitKey,",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q3 nenhuma variavel de ambiente desliga os limitadores",
    banco: false,
  },
  {
    id: "M3b",
    requisito: "Q4",
    descricao: "adiciona um skip acionado por cabecalho, sem variavel de ambiente",
    arquivo: LIMITADOR,
    de: "    keyGenerator: collectionsRateLimitKey,",
    para: '    skip: (req) => req.get("x-livre") === "1",\n    keyGenerator: collectionsRateLimitKey,',
    suite: SUITE_LIMITE,
    deveQuebrar: "Q4 nenhum dos limitadores tem opcao de pular requisicao",
    banco: false,
  },
  {
    id: "M4",
    requisito: "Q2",
    descricao: "eleva o teto por usuario a um valor que nunca e alcancado",
    arquivo: LIMITADOR,
    de: "export const TETO_COLECOES_POR_USUARIO = 300;",
    para: "export const TETO_COLECOES_POR_USUARIO = 100000;",
    suite: SUITE_LIMITE,
    deveQuebrar: "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto",
    banco: false,
  },
  {
    id: "M6",
    requisito: "R9",
    descricao: "remove o filtro por dono da leitura de historico",
    arquivo: REPO_HISTORICO,
    de: "FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC",
    para: "FROM product_history WHERE $1 IS NOT NULL ORDER BY viewed_at DESC",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "I1 usuario A nao le historico nem favorito de B",
    banco: true,
  },
  {
    id: "M7",
    requisito: "R9",
    descricao: "remove o filtro por dono da remocao de favorito",
    arquivo: REPO_FAVORITOS,
    de: "DELETE FROM product_favorites WHERE user_id = $1 AND id = $2 RETURNING id",
    para: "DELETE FROM product_favorites WHERE $1 IS NOT NULL AND id = $2 RETURNING id",
    suite: SUITE_INTEGRACAO,
    deveQuebrar: "I2 usuario B nao remove item de A",
    banco: true,
  },
];

function rodar(suite) {
  try {
    const saida = execFileSync(
      process.execPath,
      ["--test", "--test-concurrency=1", suite],
      { cwd: path.join(raiz, "backend"), encoding: "utf8", stdio: "pipe", timeout: 900000 },
    );
    return { codigo: 0, saida };
  } catch (erro) {
    return {
      codigo: erro.status ?? 1,
      saida: `${erro.stdout ?? ""}${erro.stderr ?? ""}`,
    };
  }
}

function falhasDe(saida) {
  return saida
    .split(/\r?\n/)
    .filter((linha) => /^\s*(✖|not ok)/.test(linha))
    .map((linha) =>
      linha
        .replace(/^\s*(✖|not ok\s*\d*\s*-?)\s*/, "")
        .replace(/\s*\([\d.]+ms\)\s*$/, ""),
    );
}

// Testes que PASSARAM de fato. Pulado (`﹣`, `# SKIP`) nao conta: um teste de
// banco pulado por falta de flag "passa" sem ter rodado.
function aprovadosDe(saida) {
  return saida
    .split(/\r?\n/)
    .filter((linha) => /^\s*(✔|ok\s+\d+)/.test(linha) && !/#\s*(SKIP|TODO)/i.test(linha))
    .map((linha) =>
      linha
        .replace(/^\s*(✔|ok\s+\d+\s*-?)\s*/, "")
        .replace(/\s*\([\d.]+ms\)\s*$/, ""),
    );
}

// LINHA DE BASE (v0.7.5)
//
// Um mutante so conta como MORTO se o teste que deveria pega-lo estava VERDE
// sem a mutacao. Sem essa conferencia, qualquer falha do teste nomeado contava
// como prova - inclusive o banco fora do ar.
//
// Foi o que aconteceu na v0.7.5: tres rodadas inteiras rodaram com o PostgreSQL
// local parado, e todo mutante de banco "morreu" por conexao recusada. O script
// reportou "mortas 49 | problemas 0 | APROVADO", e para os mutantes de banco
// esse numero nao provava nada.
//
// A linha de base roda cada suite SEM mutacao, antes da primeira e depois da
// ultima. Nas duas, a suite precisa sair verde e cada teste nomeado em
// `deveQuebrar` precisa ter PASSADO - nao pulado, nao ausente. Um banco parado
// nao volta sozinho: verde no comeco e verde no fim e o que permite dizer que
// ele esteve de pe no meio.
function linhaDeBase(momento, mutacoes) {
  const porSuite = new Map();
  for (const m of mutacoes) {
    if (!porSuite.has(m.suite)) porSuite.set(m.suite, new Set());
    porSuite.get(m.suite).add(m.deveQuebrar);
  }

  console.log(`[linha de base - ${momento}] ${porSuite.size} suite(s), sem mutacao`);
  const problemas = [];
  for (const [suite, nomes] of porSuite) {
    const { codigo, saida } = rodar(suite);
    const aprovados = aprovadosDe(saida);
    const faltando = [...nomes].filter((nome) => !aprovados.some((a) => a.includes(nome)));

    if (codigo !== 0) {
      const falhas = falhasDe(saida).slice(0, 3).join("; ") || "nenhum teste nomeado";
      problemas.push(`${suite} SEM mutacao saiu com codigo ${codigo} (${falhas})`);
    }
    for (const nome of faltando) {
      problemas.push(`${suite}: "${nome}" nao passou SEM mutacao - falhou, foi pulado ou nao existe`);
    }
    console.log(`  ${codigo === 0 && faltando.length === 0 ? "VERDE   " : "VERMELHA"} ${suite}`);
  }
  for (const p of problemas) console.log(`  - ${p}`);
  return problemas;
}

// RESTAURACAO QUE SOBREVIVE A MORTE DO PROCESSO
//
// A primeira versao disto confiava so em `process.on("exit")`. Na v0.7.2 uma
// execucao foi interrompida de fora, o manipulador nao rodou, e o repositorio
// ficou com a mutacao M4 aplicada: `TETO_COLECOES_POR_USUARIO = 100000`, ou
// seja, o limitador de producao praticamente desligado. Passou despercebido ate
// a conferencia seguinte. Um script que injeta defeitos de proposito nao pode
// depender de sair com educacao.
//
// Agora o conteudo original vai para um arquivo ANTES da mutacao. Se o processo
// morrer, o proximo comeca lendo esse arquivo e desfaz o estrago.
const JORNAL = path.join(raiz, "scripts/.mutation-restore.json");

function anotarNoJornal(caminho, original) {
  writeFileSync(JORNAL, JSON.stringify({ caminho, original }), "utf8");
}

function limparJornal() {
  if (existsSync(JORNAL)) rmSync(JORNAL);
}

function restaurarJornalPendente() {
  if (!existsSync(JORNAL)) return;
  try {
    const { caminho, original } = JSON.parse(readFileSync(JORNAL, "utf8"));
    writeFileSync(caminho, original);
    console.log(`[aviso] execucao anterior foi interrompida; ${path.relative(raiz, caminho)} restaurado`);
  } catch (erro) {
    console.error(`[ERRO] jornal de restauracao ilegivel: ${erro.message}`);
    console.error(`Confira ${JORNAL} e o estado do repositorio A MAO antes de continuar.`);
    process.exit(1);
  }
  limparJornal();
}

restaurarJornalPendente();

const pendentes = [];
process.on("exit", () => {
  for (const { caminho, original } of pendentes) writeFileSync(caminho, original);
  if (pendentes.length === 0) limparJornal();
});
for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(sinal, () => process.exit(130));
}

const resultados = [];

const executaveis = MUTACOES.filter((m) => !m.banco || comBanco);
const baseInicial = linhaDeBase("antes", executaveis);
if (baseInicial.length > 0) {
  console.log("");
  console.log("REPROVADO ANTES DE MUTAR: a linha de base esta vermelha.");
  console.log("Nenhuma mutacao foi aplicada. Um teste que ja falha sem defeito nao prova");
  console.log("nada quando falha com ele. Confira o ambiente - banco de pe, flags - e rode de novo.");
  process.exit(1);
}
console.log("");

for (const m of MUTACOES) {
  if (m.banco && !comBanco) {
    resultados.push({
      ...m,
      estado: "NAO EXECUTADO",
      detalhe: "exige PostgreSQL; rode com --com-banco",
    });
    console.log(`- ${m.id} (${m.requisito}) NAO EXECUTADO: exige PostgreSQL`);
    continue;
  }

  const caminho = path.join(raiz, m.arquivo);
  const original = readFileSync(caminho, "utf8");

  // A comparacao ignora o fim de linha.
  //
  // Parte dos arquivos do repositorio esta com CRLF, porque o Git converte na
  // hora do checkout no Windows. Uma ancora de varias linhas escrita com `\n`
  // simplesmente nao casa nesses arquivos, e o script marcava a mutacao como
  // INAPLICAVEL - ou seja, anunciava que nao conseguiu testar em vez de testar
  // errado. Melhor que um falso verde, mas ainda assim um teste que nao roda.
  //
  // `original` continua guardado com os bytes de origem: e ele que volta para o
  // disco na restauracao, entao o fim de linha do arquivo nao muda por causa
  // desta conferencia.
  const normalizado = original.replace(/\r\n/g, "\n");
  const ocorrencias = normalizado.split(m.de).length - 1;
  if (ocorrencias !== 1) {
    resultados.push({
      ...m,
      estado: "INAPLICAVEL",
      detalhe: `o trecho alvo aparece ${ocorrencias} vezes, esperado 1`,
    });
    console.log(`- ${m.id} (${m.requisito}) INAPLICAVEL: alvo aparece ${ocorrencias} vezes`);
    continue;
  }

  const registro = { caminho, original };
  pendentes.push(registro);
  anotarNoJornal(caminho, original);
  writeFileSync(caminho, normalizado.replace(m.de, m.para));

  console.log(`- ${m.id} (${m.requisito}) ${m.descricao}...`);
  const { codigo, saida } = rodar(m.suite);

  writeFileSync(caminho, original);
  pendentes.splice(pendentes.indexOf(registro), 1);
  limparJornal();

  const falhas = falhasDe(saida);
  const pegou = falhas.some((nome) => nome.includes(m.deveQuebrar));

  if (codigo === 0) {
    resultados.push({
      ...m,
      estado: "MUTACAO SOBREVIVEU",
      detalhe: "a suite passou com o defeito aplicado",
    });
    console.log("  MUTACAO SOBREVIVEU - a suite passou com o defeito. O teste nao protege nada.");
  } else if (!pegou) {
    resultados.push({
      ...m,
      estado: "PEGO PELO TESTE ERRADO",
      detalhe: `falharam: ${falhas.join("; ") || "(nenhum teste nomeado)"}`,
    });
    console.log(`  PEGO PELO TESTE ERRADO - falharam: ${falhas.join("; ") || "(nenhum)"}`);
  } else {
    resultados.push({ ...m, estado: "MORTA", detalhe: `"${m.deveQuebrar}" falhou, como deveria` });
    console.log(`  MORTA - "${m.deveQuebrar}" ficou vermelho, como deveria`);
  }
}

console.log("");
const baseFinal = linhaDeBase("depois", executaveis);

console.log("");
console.log("=".repeat(78));
const mortas = resultados.filter((r) => r.estado === "MORTA");
const naoExecutadas = resultados.filter((r) => r.estado === "NAO EXECUTADO");
const problemas = resultados.filter((r) => r.estado !== "MORTA" && r.estado !== "NAO EXECUTADO");

for (const r of resultados) {
  console.log(`${r.id}  ${r.requisito.padEnd(4)} ${r.estado.padEnd(22)} ${r.detalhe}`);
}
console.log("=".repeat(78));
console.log(
  `mortas ${mortas.length} | nao executadas ${naoExecutadas.length} | problemas ${problemas.length}` +
    ` | linha de base: antes verde, depois ${baseFinal.length === 0 ? "verde" : "VERMELHA"}`,
);

if (baseFinal.length > 0) {
  // O ambiente quebrou no meio da rodada. As mortes registradas depois desse
  // ponto podem ser do ambiente, e nao do teste - nenhuma delas vale.
  console.log("");
  console.log("REPROVADO: a linha de base FINAL esta vermelha. O ambiente mudou durante a");
  console.log("rodada, e nenhuma morte desta execucao pode ser tomada como prova.");
  process.exitCode = 1;
} else if (problemas.length > 0) {
  console.log("");
  console.log("REPROVADO: ha teste que nao detecta o defeito que deveria detectar.");
  process.exitCode = 1;
} else if (naoExecutadas.length > 0) {
  console.log("");
  console.log("Mutacoes sem banco: OK. As que exigem PostgreSQL ficaram NAO EXECUTADAS.");
} else {
  console.log("");
  console.log("APROVADO: toda mutacao foi detectada pelo teste correspondente.");
}
