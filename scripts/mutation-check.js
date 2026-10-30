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
const MIGRATION001 = "backend/migrations/001_initial_schema.sql";
const MIGRATION002 = "backend/migrations/002_history_favorites.sql";
const ACCOUNT_REPO = "backend/src/repositories/accountRepository.js";
const ACCOUNT_SERVICE = "backend/src/services/accountService.js";
const ACCOUNT_CONTROLLER = "backend/src/controllers/accountController.js";
const ACCOUNT_ROUTES = "backend/src/routes/accountRoutes.js";
const E2E_GATE = "scripts/lib/e2eGate.js";
const ENV_BACKEND = "backend/src/config/env.js";
const ERRO_BACKEND = "backend/src/middleware/errorMiddleware.js";
const APP_BACKEND = "backend/src/app.js";
const VERSION_CHECK = "scripts/version-check.js";
const VERIFY_DEPLOY = "scripts/verify-deploy.js";
const RENDER_YAML = "render.yaml";
const TEXTO_FRONTEND = "src/utils/text.js";
const SERVER_BACKEND = "backend/src/server.js";
const MIGRATE_BACKEND = "backend/scripts/migrate.js";
const DOCTOR_CHECKS = "scripts/lib/doctorChecks.js";
const E2E_REAL = "scripts/e2e-real.js";
const MIGRATION004 = "backend/migrations/004_nivel_de_alerta.sql";
const ASSISTANT_PROMPT = "backend/src/ai/assistantPrompt.js";
const ASSISTANT_SERVICE = "backend/src/ai/assistantService.js";
const PROFILE_CONTROLLER = "backend/src/controllers/profileController.js";
const COMPARACAO_SHARED = "shared/productComparison.js";
const COMPARACAO_SERVICE = "backend/src/services/comparisonService.js";
const COMPARACAO_PROMPT = "backend/src/ai/comparisonPrompt.js";
const COMPARACAO_CONTROLLER = "backend/src/controllers/compareController.js";
const COMPARACAO_ROTAS = "backend/src/routes/compareRoutes.js";
const OFFLINE_CACHE = "src/services/offlineCache.js";
const OFFLINE_LOOKUP = "src/services/offlineLookup.js";
const OFFLINE_SESSAO = "src/services/offlineSession.js";
const VEREDITO_JSX = "src/components/assistant/AllergyVerdict.jsx";
const ANUNCIO_JSX = "src/components/common/AnuncioDoVeredito.jsx";
const ASSISTENTE_JSX = "src/pages/Assistant/AssistantPage.jsx";
const COMPARACAO_JSX = "src/pages/Compare/ComparePage.jsx";
const BUSCA_JSX = "src/pages/Search/SearchPage.jsx";
const CSS_DESIGN = "src/styles.css";
const CSS_V070 = "src/styles-v070.css";
const SW_POLITICA = "src/sw/politicaDeCache.js";
const SW_CODIGO = "src/sw/service-worker.js";
const SW_REGISTRO = "src/sw/registro.js";
const SW_LIMPEZA = "src/sw/limpezaDoCacheStorage.js";
const SW_MONTAR = "src/sw/montarServiceWorker.js";
const MAIN_JSX = "src/main.jsx";
const MANIFESTO = "public/manifest.webmanifest";

const SUITE_BARCODE = "tests/barcode.test.js";
const SUITE_LOOKUP = "tests/productLookup.test.js";
const SUITE_LIMITE = "tests/rateLimit.test.js";
const SUITE_INTEGRACAO = "tests/collectionsIntegration.test.js";
const SUITE_PRODUCAO = "tests/productionHardening.test.js";
const SUITE_DEPLOY = "tests/verifyDeploy.test.js";
const SUITE_RENDER = "tests/renderSync.test.js";
const SUITE_CORPO = "tests/bodyParseError.test.js";
const SUITE_MIGRATE = "tests/migrate.test.js";
const SUITE_DOCTOR = "tests/doctor.test.js";
const SUITE_GATE = "tests/e2eGate.test.js";
const SUITE_CONTA = "tests/accountIntegration.test.js";
const SUITE_NIVEL = "tests/alertLevel.test.js";
const SUITE_NIVEL_BANCO = "tests/alertLevelIntegration.test.js";
const SUITE_COMPARACAO = "tests/comparison.test.js";
const SUITE_COMPARACAO_BANCO = "tests/comparisonIntegration.test.js";
const SUITE_OFFLINE = "tests/offline.test.js";
const SUITE_ACESSIBILIDADE = "tests/accessibility.test.js";
const SUITE_SERVICE_WORKER = "tests/serviceWorker.test.js";

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
  // --- leitura da camera (para a v0.8.0, por decisao do dono do projeto) -------
  {
    id: "U1",
    requisito: "C2",
    descricao: "a leitura da camera volta a apagar as letras",
    arquivo: TEXTO_FRONTEND,
    de: "  if (bruto.length <= TAMANHO_MAXIMO_DO_CODIGO && /^[A-Za-z0-9._-]+$/.test(bruto)) return bruto;",
    para: '  if (bruto) return bruto.replace(/[^\\d]/g, "");',
    suite: SUITE_LOOKUP,
    deveQuebrar: "C2 a camera nunca transforma um codigo em outro",
    banco: false,
  },
  {
    id: "U2",
    requisito: "C2",
    descricao: "o App volta a limpar a leitura da camera com cleanBarcode",
    arquivo: APP,
    de: "            const detectedBarcode = codigoLidoPelaCamera(result.getText());",
    para: "            const detectedBarcode = cleanBarcode(result.getText());",
    suite: SUITE_LOOKUP,
    deveQuebrar: "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome",
    banco: false,
  },
  {
    id: "U3",
    requisito: "C2",
    descricao: "leitura da camera volta a poder cair na busca por nome",
    arquivo: APP,
    de: '      if (origem !== "camera" && !isBarcodeQuery(nextQuery)) {',
    para: "      if (!isBarcodeQuery(nextQuery)) {",
    suite: SUITE_LOOKUP,
    deveQuebrar: "C2 o App usa a leitura segura e nunca manda leitura da camera para a busca por nome",
    banco: false,
  },
  // --- demais correcoes autorizadas pelo dono, para a v0.8.0 -------------------
  //
  // Nao ha mutante para o isolamento do `env.test.js`, e e de proposito: o
  // defeito a injetar seria "escrever no backend/.env real", e a rodada de
  // mutacao o executaria de verdade, apagando a configuracao do dono.
  {
    id: "U4",
    requisito: "O2e",
    descricao: "corpo grande demais volta a virar erro interno 500",
    arquivo: ERRO_BACKEND,
    de: "  if (ehCorpoGrandeDemais(error)) {",
    para: "  if (false) {",
    suite: SUITE_CORPO,
    deveQuebrar: "O2e corpo grande demais responde 413 fixo, sem a mensagem do leitor",
    banco: false,
  },
  {
    id: "U4b",
    requisito: "O2e",
    descricao: "basta copiar o type do corpo grande para ganhar 413",
    arquivo: ERRO_BACKEND,
    de: '  return error?.constructor?.name === "PayloadTooLargeError" && error.type === "entity.too.large";',
    para: '  return error.type === "entity.too.large";',
    suite: SUITE_CORPO,
    deveQuebrar: "O2e copiar name, type e status do corpo grande nao basta para ganhar 413",
    banco: false,
  },
  {
    id: "U5",
    requisito: "MODO",
    descricao: "NODE_ENV desconhecido volta a ser aceito",
    arquivo: ENV_BACKEND,
    de: "  if (VALID_NODE_ENVS.has(bruto.trim().toLowerCase())) return [];",
    para: "  return [];",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel",
    banco: false,
  },
  {
    id: "U5b",
    requisito: "MODO",
    descricao: "o servidor deixa de conferir o modo antes de subir",
    arquivo: SERVER_BACKEND,
    de: "  if (modo.length > 0) {",
    para: "  if (false) {",
    suite: SUITE_PRODUCAO,
    deveQuebrar: "MODO NODE_ENV digitado errado nao sobe, e diz qual variavel",
    banco: false,
  },
  {
    id: "U6",
    requisito: "MIG",
    descricao: "a falha de migration volta a imprimir so error.message",
    arquivo: MIGRATE_BACKEND,
    de: "  console.error(`Migration falhou:\\n${descreverFalha(error)}`);",
    para: "  console.error(error.message);",
    suite: SUITE_MIGRATE,
    deveQuebrar: "MIG migration que nao alcanca o banco falha dizendo por que",
    banco: false,
  },
  {
    id: "U7",
    requisito: "MIG",
    descricao: "o doctor volta a contar so migrations .sql",
    arquivo: DOCTOR_CHECKS,
    de: '  return fileName.endsWith(".sql") || fileName.endsWith(".js");',
    para: '  return fileName.endsWith(".sql");',
    suite: SUITE_DOCTOR,
    deveQuebrar: "o doctor conta as mesmas migrations que o runner aplica, .sql e .js",
    banco: false,
  },
  {
    id: "U8",
    requisito: "ORC",
    descricao: "o orcamento do gate deixa de mostrar o teto por IP",
    arquivo: E2E_REAL,
    de: "const TETOS_POR_IP = { colecoes: 3000, exportacao: 20, comparacao: 300 };",
    para: "const TETOS_POR_IP = {};",
    suite: SUITE_GATE,
    deveQuebrar: "o orcamento do gate usa os mesmos tetos do limitador, inclusive o por IP",
    banco: false,
  },
  // --- v0.8.0: direitos do titular ---------------------------------------------
  //
  // Os seis pedidos pelo prompt (E2, E4, E5, D2, D4, D8) e alguns a mais. Nao ha
  // mutante "a exclusao deixa de apagar as sessoes": a cascata de `sessions`
  // apagaria do mesmo jeito, entao esse mutante nao mudaria comportamento
  // nenhum - sobreviveria sem que isso dissesse algo sobre os testes. O D5 e o
  // mutante W5b (cascata de `sessions` removida) cobrem o que importa.
  {
    id: "W1",
    requisito: "E2",
    descricao: "a exportacao passa a incluir o registro bruto do usuario, com hash",
    arquivo: ACCOUNT_REPO,
    de:
      "  const { rows } = await client.query(`SELECT ${COLUNAS_DA_CONTA} FROM users WHERE id = $1`, [userId]);\n" +
      "  return rows[0] ? { nome: rows[0].name, email: rows[0].email, criadaEm: rows[0].created_at } : null;",
    para:
      '  const { rows } = await client.query("SELECT * FROM users WHERE id = $1", [userId]);\n' +
      "  return rows[0] ? { ...rows[0], nome: rows[0].name, email: rows[0].email, criadaEm: rows[0].created_at } : null;",
    suite: SUITE_CONTA,
    deveQuebrar: "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor",
    banco: true,
  },
  {
    id: "W1b",
    requisito: "E2",
    descricao: "o servico passa a repassar a conta inteira em vez dos campos escolhidos",
    arquivo: ACCOUNT_SERVICE,
    de: "    conta: { nome: conta.nome, email: conta.email, criadaEm: data(conta.criadaEm) },",
    para: "    conta: { ...(await findUserById(userId)), nome: conta.nome, email: conta.email, criadaEm: data(conta.criadaEm) },",
    suite: SUITE_CONTA,
    deveQuebrar: "E2 a exportacao nao contem o password_hash nem o salt reais - pelo valor",
    banco: true,
  },
  {
    id: "W2",
    requisito: "E4",
    descricao: "a consulta de historico da exportacao perde o filtro por usuario",
    arquivo: ACCOUNT_REPO,
    de: "FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC",
    para: "FROM product_history WHERE $1::uuid IS NOT NULL ORDER BY viewed_at DESC",
    suite: SUITE_CONTA,
    deveQuebrar: "E4 a exportacao de A nao contem nada de B, com B populado",
    banco: true,
  },
  {
    id: "W2b",
    requisito: "E4",
    descricao: "a consulta de favoritos da exportacao perde o filtro por usuario",
    arquivo: ACCOUNT_REPO,
    de: "FROM product_favorites WHERE user_id = $1 ORDER BY created_at DESC",
    para: "FROM product_favorites WHERE $1::uuid IS NOT NULL ORDER BY created_at DESC",
    suite: SUITE_CONTA,
    deveQuebrar: "E4 a exportacao de A nao contem nada de B, com B populado",
    banco: true,
  },
  {
    id: "W3",
    requisito: "E5",
    descricao: "a exportacao passa a ler req.body.userId",
    arquivo: ACCOUNT_CONTROLLER,
    de: "  const dados = await exportarDadosDoTitular(req.user.id);",
    para: "  const dados = await exportarDadosDoTitular(req.body?.userId ?? req.user.id);",
    suite: SUITE_CONTA,
    deveQuebrar: "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado",
    banco: true,
  },
  {
    id: "W3b",
    requisito: "E5",
    descricao: "a exportacao passa a ler o userId da query",
    arquivo: ACCOUNT_CONTROLLER,
    de: "  const dados = await exportarDadosDoTitular(req.user.id);",
    para: "  const dados = await exportarDadosDoTitular(req.query.userId ?? req.user.id);",
    suite: SUITE_CONTA,
    deveQuebrar: "E5 userId no corpo, na query ou em cabecalho nao muda quem e exportado",
    banco: true,
  },
  {
    id: "W4",
    requisito: "D2",
    descricao: "a exclusao deixa de revalidar a senha",
    arquivo: ACCOUNT_SERVICE,
    de: "  if (!senhaConfere) {",
    para: "  if (false) {",
    suite: SUITE_CONTA,
    deveQuebrar: "D2 exclusao com senha errada nao remove nada",
    banco: true,
  },
  {
    id: "W5",
    requisito: "D4",
    descricao: "a cascata sai de product_favorites, na migration",
    arquivo: MIGRATION002,
    de:
      "  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n" +
      "  product_code text NOT NULL,\n  product_name text NOT NULL,\n  product_brand text,\n  image_url text,\n  created_at",
    para:
      "  user_id uuid NOT NULL REFERENCES users(id),\n" +
      "  product_code text NOT NULL,\n  product_name text NOT NULL,\n  product_brand text,\n  image_url text,\n  created_at",
    suite: SUITE_CONTA,
    deveQuebrar: "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users",
    banco: true,
  },
  {
    id: "W5b",
    requisito: "D4",
    descricao: "a cascata sai de sessions, na migration",
    arquivo: MIGRATION001,
    de: "  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  token_hash text NOT NULL UNIQUE,",
    para: "  user_id uuid NOT NULL REFERENCES users(id),\n  token_hash text NOT NULL UNIQUE,",
    suite: SUITE_CONTA,
    deveQuebrar: "D4 o schema montado SO pelas migrations tem ON DELETE CASCADE em toda FK para users",
    banco: true,
  },
  {
    id: "W6",
    requisito: "D8",
    descricao: "a exclusao deixa de ser transacional",
    arquivo: ACCOUNT_SERVICE,
    de: "const executarEmTransacao = withTransaction;",
    para: 'const executarEmTransacao = async (fn) => fn({ query: (await import("../database/pool.js")).query });',
    suite: SUITE_CONTA,
    deveQuebrar: "D8 falha simulada no meio da exclusao deixa o estado anterior intacto",
    banco: true,
  },
  {
    id: "W7",
    requisito: "E8",
    descricao: "a rota de exportacao perde o limitador proprio",
    arquivo: ACCOUNT_ROUTES,
    de: 'accountRoutes.get("/export", requireAuth, exportRateLimit, exportar);',
    para: 'accountRoutes.get("/export", requireAuth, exportar);',
    suite: SUITE_CONTA,
    deveQuebrar: "E8 a rota real recusa a exportacao acima do teto do usuario",
    banco: true,
  },
  {
    id: "W8",
    requisito: "D9",
    descricao: "a exclusao sai do limitador de autenticacao",
    arquivo: ACCOUNT_ROUTES,
    de: 'accountRoutes.delete("/", authRateLimit, requireAuth, excluir);',
    para: 'accountRoutes.delete("/", requireAuth, excluir);',
    suite: SUITE_CONTA,
    deveQuebrar: "D9 a tentativa com senha errada gasta o mesmo balde do login",
    banco: true,
  },
  {
    id: "W9",
    requisito: "D1",
    descricao: "a exclusao deixa de limpar o cookie de sessao",
    arquivo: ACCOUNT_CONTROLLER,
    de: "  clearSessionCookie(res);",
    para: "  void clearSessionCookie;",
    suite: SUITE_CONTA,
    deveQuebrar: "D1 exclusao com a senha correta remove a conta e limpa o cookie",
    banco: true,
  },
  {
    id: "W10",
    requisito: "E7",
    descricao: "o nome do arquivo passa a levar o e-mail do titular",
    arquivo: ACCOUNT_CONTROLLER,
    de: '    "Content-Disposition": `attachment; filename="${nomeDoArquivoDeExportacao(dados.geradoEm)}"`,',
    para: '    "Content-Disposition": `attachment; filename="${dados.conta.email}-${nomeDoArquivoDeExportacao(dados.geradoEm)}"`,',
    suite: SUITE_CONTA,
    deveQuebrar: "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache",
    banco: true,
  },
  {
    id: "W10b",
    requisito: "E7",
    descricao: "a exportacao passa a poder ir para cache",
    arquivo: ACCOUNT_CONTROLLER,
    de: '    "Cache-Control": "no-store",',
    para: '    "Cache-Control": "private, max-age=3600",',
    suite: SUITE_CONTA,
    deveQuebrar: "E7 o arquivo nao leva e-mail nem nome, e a resposta nao pode ir para cache",
    banco: true,
  },
  {
    id: "W11",
    requisito: "A11",
    descricao: "o gate perde o requisito accountDeletion",
    arquivo: E2E_GATE,
    de: '    ["accountDeletion", report.accountDeletion === "PASSED"],',
    para: "",
    suite: SUITE_GATE,
    deveQuebrar: "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache",
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
    para: "    const validacao = { valido: true, codigo: codigoLidoPelaCamera(entrada) };",
    suite: SUITE_LOOKUP,
    deveQuebrar: "M2 codigo invalido nao chega a rede",
    banco: false,
  },
  {
    id: "P4",
    requisito: "M5",
    descricao: "remove o piso de risco do veredito",
    arquivo: VEREDITO,
    // A linha mudou de forma na v0.9.0 (o piso agora sai de `minimumSafetyFor`);
    // o defeito injetado e o mesmo: veredito sem piso nenhum.
    de: "    minimumSafety: minimumSafetyFor(status, conflicts),",
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
  // --- v0.9.0: nivel de alerta por alergia ("severidade" no prompt) ---------
  //
  // Os seis pedidos pelo prompt (S2, S3, S5, S6, S12, S13) e alguns a mais.
  // "Severidade passa a ser gravada junto com o item do historico" nao cabe num
  // mutante de um arquivo so - gravar exige coluna E escrita. Vira duas metades,
  // cada uma pega por um S13: X6 cria o lugar para guardar (schema), X6b faz o
  // item sair com o nivel (leitura).
  {
    id: "X1",
    requisito: "S2",
    descricao: "o piso do alerta maximo volta a ser caution",
    arquivo: VEREDITO,
    de: 'export const STRICT_CONFLICT_MINIMUM_SAFETY = "urgent";',
    para: 'export const STRICT_CONFLICT_MINIMUM_SAFETY = "caution";',
    suite: SUITE_NIVEL,
    deveQuebrar: "S2 alerta maximo + conflito declarado: piso urgent",
    banco: false,
  },
  {
    id: "X2",
    requisito: "S3",
    descricao: "traco de alergia em alerta maximo volta a nao produzir conflito",
    arquivo: VEREDITO,
    de:
      "    ...traceRisks\n" +
      "      .filter((risk) => isStrictAlert(alertLevels, risk.id))\n" +
      "      .map((risk) => pickStrictRisk(risk, VERDICT_ORIGIN.traces)),\n" +
      "  ];\n" +
      "  const traces = traceRisks.filter((risk) => !isStrictAlert(alertLevels, risk.id)).map(pickRisk);",
    para: "  ];\n  const traces = traceRisks.map(pickRisk);",
    suite: SUITE_NIVEL,
    deveQuebrar: "S3 alerta maximo + traco: conflito no veredito, piso caution",
    banco: false,
  },
  {
    id: "X3",
    requisito: "S5",
    descricao: "o piso deixa de ser imposto depois da resposta do modelo",
    arquivo: VEREDITO,
    de: "  const safety = raiseSafety(rest.safety, verdict?.minimumSafety);",
    para: "  const safety = rest.safety;",
    suite: SUITE_NIVEL,
    deveQuebrar: "S5 o modelo respondendo normal nao derruba o piso em nenhum dos casos",
    banco: false,
  },
  {
    id: "X4",
    requisito: "S6",
    descricao: "o schema da resposta do modelo passa a aceitar campo de nivel",
    arquivo: ASSISTANT_PROMPT,
    de: "    usedProductContext: z.boolean(),\n  })\n  .strict();",
    para:
      "    usedProductContext: z.boolean(),\n" +
      "    alertLevel: z.string().optional(),\n" +
      "    alertLevels: z.record(z.string()).optional(),\n" +
      "    severity: z.string().optional(),\n" +
      "  })\n  .strict();",
    suite: SUITE_NIVEL,
    deveQuebrar: "S6 o modelo nao escreve nem influencia o nivel: campo de nivel vindo dele derruba a resposta",
    banco: false,
  },
  {
    id: "X5",
    requisito: "S12",
    descricao: "a restricao CHECK do nivel sai da migration 004",
    arquivo: MIGRATION004,
    de:
      "    ALTER TABLE user_allergies\n" +
      "      ADD CONSTRAINT user_allergies_alert_level_check\n" +
      "      CHECK (alert_level IN ('standard', 'strict'));",
    para: "    NULL;",
    suite: SUITE_NIVEL_BANCO,
    deveQuebrar: "S12 o banco recusa nivel invalido inserido direto em SQL - no banco e no schema das migrations",
    banco: true,
  },
  {
    id: "X6",
    requisito: "S13",
    descricao: "a migration passa a criar onde guardar o nivel junto do item do historico",
    arquivo: MIGRATION004,
    de: "ALTER TABLE user_allergies\n  ADD COLUMN IF NOT EXISTS alert_level text NOT NULL DEFAULT 'standard';",
    para:
      "ALTER TABLE user_allergies\n  ADD COLUMN IF NOT EXISTS alert_level text NOT NULL DEFAULT 'standard';\n\n" +
      "ALTER TABLE product_history\n  ADD COLUMN IF NOT EXISTS alert_level text;",
    suite: SUITE_NIVEL_BANCO,
    deveQuebrar: "S13 nenhuma tabela de colecao tem onde guardar nivel ou veredito - no banco e no schema das migrations",
    banco: true,
  },
  {
    id: "X6b",
    requisito: "S13",
    descricao: "o item do historico passa a sair com o nivel de alerta",
    arquivo: REPO_HISTORICO,
    de: "    `SELECT ${COLUNAS} FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC`,",
    para:
      "    `SELECT ${COLUNAS}, (SELECT json_object_agg(allergy_id, alert_level) FROM user_allergies ua WHERE ua.user_id = product_history.user_id) AS \"alertLevels\" FROM product_history WHERE user_id = $1 ORDER BY viewed_at DESC`,",
    suite: SUITE_NIVEL_BANCO,
    deveQuebrar: "S13 nivel nao congelado: o item salvo nao muda e a leitura seguinte reflete o nivel novo",
    banco: true,
  },
  {
    id: "X7",
    requisito: "S17",
    descricao: "o registro de minimizacao volta a levar o piso aplicado",
    arquivo: ASSISTANT_SERVICE,
    de: '      modelSafety: "normal",\n      total: minimizationAttempts,',
    para: '      modelSafety: "normal",\n      enforcedSafety: verdict.minimumSafety,\n      total: minimizationAttempts,',
    suite: SUITE_NIVEL,
    deveQuebrar: "S17 o log da tentativa de minimizacao e o mesmo com alerta padrao ou maximo",
    banco: false,
  },
  {
    id: "X8",
    requisito: "S18",
    descricao: "o nivel de alerta passa a ir ao modelo dentro do allergySnapshot",
    arquivo: ASSISTANT_SERVICE,
    de: "  const context = buildAssistantContext({\n    product: data.product,\n    allergies: profileAllergies,\n  });",
    para:
      "  const context = buildAssistantContext({\n    product: data.product,\n    allergies: profileAllergies,\n  });\n" +
      "  context.allergySnapshot.alertLevels = alertLevels;",
    suite: SUITE_NIVEL,
    deveQuebrar: "S18 o payload enviado a Anthropic nao ganhou canal novo: o nivel nao vai nem no allergySnapshot",
    banco: false,
  },
  {
    id: "X9",
    requisito: "A11",
    descricao: "o gate perde o requisito severityVerdict",
    arquivo: E2E_GATE,
    de: '    ["severityVerdict", report.severityVerdict === "PASSED"],\n',
    para: "",
    suite: SUITE_GATE,
    deveQuebrar: "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache",
    banco: false,
  },
  {
    id: "X10",
    requisito: "S9",
    descricao: "a validacao passa a aceitar nivel para alergia ausente do perfil",
    arquivo: VALIDACAO_BACKEND,
    de: "      if (!perfil.has(allergyId)) {",
    para: "      if (false && !perfil.has(allergyId)) {",
    suite: SUITE_NIVEL,
    deveQuebrar: "S9 nivel para alergia ausente do perfil e recusado pela validacao",
    banco: false,
  },
  {
    id: "X11",
    requisito: "S1",
    descricao: "o conflito de alergia padrao ganha campos e deixa de ser o da v0.8.0",
    arquivo: VEREDITO,
    de: "      isStrictAlert(alertLevels, risk.id) ? pickStrictRisk(risk, VERDICT_ORIGIN.declared) : pickRisk(risk),",
    para:
      "      isStrictAlert(alertLevels, risk.id)\n" +
      "        ? pickStrictRisk(risk, VERDICT_ORIGIN.declared)\n" +
      '        : { ...pickRisk(risk), origin: VERDICT_ORIGIN.declared, alertLevel: "standard" },',
    suite: SUITE_NIVEL,
    deveQuebrar: "S1 nivel padrao + conflito declarado: piso caution, identico a v0.8.0",
    banco: false,
  },
  {
    id: "X12",
    requisito: "S8",
    descricao: "a validacao passa a aceitar qualquer texto como nivel",
    arquivo: VALIDACAO_BACKEND,
    de: '    z.enum(ALERT_LEVEL_VALUES, { message: "Nível de alerta inválido. Use standard ou strict." }),',
    para: "    z.string(),",
    suite: SUITE_NIVEL,
    deveQuebrar: "S8 nivel desconhecido e recusado pela validacao",
    banco: false,
  },
  {
    id: "X13",
    requisito: "S16",
    descricao: "a rota do perfil passa a aceitar userId do corpo",
    arquivo: PROFILE_CONTROLLER,
    de: "  const user = await updateAllergies(req.user.id, req.body);",
    para: "  const user = await updateAllergies(req.body?.userId || req.user.id, req.body);",
    suite: SUITE_NIVEL_BANCO,
    deveQuebrar: "S16 o nivel de A nao e visivel nem alteravel por B",
    banco: true,
  },

  // v0.10.0 - comparacao de dois produtos.
  {
    id: "Y1",
    requisito: "C2t",
    descricao: "o segundo produto passa a usar o veredito do primeiro",
    arquivo: COMPARACAO_SHARED,
    de: "  const ladoB = analyzeComparedProduct(entradaB.product, perfil);",
    para: "  const ladoB = { ...analyzeComparedProduct(entradaB.product, perfil), allergyVerdict: ladoA.allergyVerdict };",
    suite: SUITE_COMPARACAO,
    deveQuebrar:
      "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado",
    banco: false,
  },
  {
    id: "Y2",
    requisito: "C2t",
    descricao: "o piso passa a ser calculado uma vez para a comparacao inteira",
    arquivo: COMPARACAO_SERVICE,
    de: "    const final = finalizar(respostaPara(produto), produto.allergyVerdict);",
    para:
      "    const final = finalizar(\n" +
      "      respostaPara(produto),\n" +
      "      comparacao.products.find((p) => p.allergyVerdict.minimumSafety)?.allergyVerdict ?? produto.allergyVerdict,\n" +
      "    );",
    suite: SUITE_COMPARACAO,
    deveQuebrar:
      "C2t produto em conflito com produto limpo: o limpo nao herda safety e o em conflito nao e rebaixado",
    banco: false,
  },
  {
    id: "Y3",
    requisito: "C5t",
    descricao: "a explicacao passa a ser amarrada pela posicao na lista do modelo",
    arquivo: COMPARACAO_SERVICE,
    de: "      const explicacao = porCodigo.get(produto.code);",
    para: "      const explicacao = resposta.explanations[comparacao.products.indexOf(produto)];",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C5t explicacoes em ordem trocada: cada uma cai no produto certo, pelo codigo",
    banco: false,
  },
  {
    id: "Y4",
    requisito: "C7t",
    descricao: "o schema da explicacao passa a aceitar campo extra, como allergyVerdict",
    arquivo: COMPARACAO_PROMPT,
    de: "          .strict(),\n      )\n      .length(2),",
    para: "          .passthrough(),\n      )\n      .length(2),",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C7t o modelo nao escreve, nao altera e nao reordena veredito",
    banco: false,
  },
  {
    id: "Y5",
    requisito: "C8t",
    descricao: "produto sem dado de alergenico passa a mostrar 'nao aparece no rotulo'",
    arquivo: COMPARACAO_SHARED,
    de: "  if (lado.allergenData === ALLERGEN_DATA.notInformed) return ALLERGEN_STATE.notInformed;",
    para: "  if (false) return ALLERGEN_STATE.notInformed;",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum",
    banco: false,
  },
  {
    id: "Y5b",
    requisito: "C8t",
    descricao: "nutriente nao informado passa a valer 0",
    arquivo: COMPARACAO_SHARED,
    de: "  if (valor === null || valor === undefined) return null;",
    para: "  if (valor === null || valor === undefined) return 0;",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum",
    banco: false,
  },
  {
    id: "Y5c",
    requisito: "C8t",
    descricao: "o veredito deixa de saber que o produto nao tem dado de alergenico",
    arquivo: COMPARACAO_SHARED,
    de: "    allergenDataAvailable: informado,",
    para: "    allergenDataAvailable: true,",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C8t produto sem dado de alergenico: a ausencia nao vira 'nao contem' em lugar nenhum",
    banco: false,
  },
  {
    id: "Y6",
    requisito: "C6t",
    descricao: "a explicacao deixa de passar pelo piso: o safety do modelo vale",
    arquivo: COMPARACAO_SERVICE,
    de: "    (respostaDoProduto, veredito) => finalizeAssistantResponse(respostaDoProduto, veredito, options),",
    para: "    (respostaDoProduto, veredito) => ({ ...respostaDoProduto, allergyVerdict: veredito }),",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C6t o modelo respondendo normal nao derruba o piso de nenhum dos dois",
    banco: false,
  },
  {
    id: "Y7",
    requisito: "C9t",
    descricao: "codigo invalido em um dos dois deixa de barrar a busca",
    arquivo: LOOKUP,
    de: "  if (preparados.some((preparado) => preparado.estado === CODIGO_INVALIDO)) {",
    para: "  if (false) {",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C9t digito verificador invalido em qualquer dos dois e recusado antes de qualquer busca",
    banco: false,
  },
  {
    id: "Y8",
    requisito: "C11",
    descricao: "codigos iguais deixam de ser recusados no aparelho",
    arquivo: LOOKUP,
    de: "  if (identidadeDoCodigo(preparados[0].codigo) === identidadeDoCodigo(preparados[1].codigo)) {",
    para: "  if (false) {",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C11 codigos iguais: recusados com mensagem clara, sem busca",
    banco: false,
  },
  {
    id: "Y8b",
    requisito: "C11",
    descricao: "codigos iguais deixam de ser recusados pela API",
    arquivo: VALIDACAO_BACKEND,
    de: "    if (a?.code && a.code === b?.code) {",
    para: "    if (false) {",
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C11 codigos iguais: recusados com mensagem clara, sem busca",
    banco: false,
  },
  {
    id: "Y9",
    requisito: "A11",
    descricao: "o gate perde o requisito productComparison",
    arquivo: E2E_GATE,
    de: '    ["productComparison", report.productComparison === "PASSED"],\n',
    para: "",
    suite: SUITE_GATE,
    deveQuebrar: "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache",
    banco: false,
  },
  {
    id: "Y10",
    requisito: "C13",
    descricao: "a rota da comparacao passa a aceitar userId do corpo",
    arquivo: COMPARACAO_CONTROLLER,
    de: "  res.json(await compararProdutos(req, req.body));",
    para: "  res.json(await compararProdutos(req.body?.userId ? { user: { id: req.body.userId } } : req, req.body));",
    suite: SUITE_COMPARACAO_BANCO,
    deveQuebrar: "C13 a sessao de B com o id de A no corpo compara com o perfil de B",
    banco: true,
  },
  {
    id: "Y11",
    requisito: "C15",
    descricao: "a rota da comparacao perde o limitador",
    arquivo: COMPARACAO_ROTAS,
    de: 'compareRoutes.post("/", optionalAuth, compareRateLimit, comparar);',
    para: 'compareRoutes.post("/", optionalAuth, comparar);',
    suite: SUITE_COMPARACAO,
    deveQuebrar: "C15 o limitador cobre as duas rotas: comparacao 30/300 por 10 min, explicacao no balde do assistente",
    banco: false,
  },

  // v0.11.0 - leitura sem rede.
  {
    id: "Z1",
    requisito: "O3",
    descricao: "o cache passa a guardar o allergyVerdict junto com o produto",
    arquivo: OFFLINE_CACHE,
    de: "      loja.put({ dono: String(dono), codigo: reduzido.code, guardadoEm: agora(), produto: reduzido });",
    para:
      "      loja.put({ dono: String(dono), codigo: reduzido.code, guardadoEm: agora(), produto: reduzido, allergyVerdict: produto.allergyVerdict ?? null });",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O3 o cache NAO contem allergyVerdict nem resultado do motor em nenhuma chave",
    banco: false,
  },
  {
    id: "Z2",
    requisito: "O4",
    descricao: "a leitura offline passa a usar o perfil do momento do cache",
    arquivo: OFFLINE_CACHE,
    de: "      transacao.objectStore(LOJAS.perfis).put(registro);",
    para:
      "      if (!(await pedido(transacao.objectStore(LOJAS.perfis).get(registro.dono)))) transacao.objectStore(LOJAS.perfis).put(registro);",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O4 perfil alterado DEPOIS do cache: a leitura offline reflete o perfil NOVO",
    banco: false,
  },
  {
    id: "Z3",
    requisito: "O9",
    descricao: "o logout deixa de limpar o cache",
    arquivo: OFFLINE_SESSAO,
    de: "  await cache.apagarContas();\n  return { servidorRespondeu };",
    para: "  return { servidorRespondeu };",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O9 LOGOUT limpa o cache: nenhuma chave e nenhum VALOR com o id de alergia ou o historico da conta",
    banco: false,
  },
  {
    id: "Z4",
    requisito: "O11",
    descricao: "o cache passa a guardar o token de sessao",
    arquivo: OFFLINE_CACHE,
    de: '    nome: texto(usuario.name, 120) ?? "",',
    para: '    nome: texto(usuario.name, 120) ?? "",\n    token: usuario.token ?? usuario.sessionToken ?? null,',
    suite: SUITE_OFFLINE,
    deveQuebrar: "O11 o cache nunca contem senha, hash, salt, token, cookie, chave de API nem e-mail",
    banco: false,
  },
  {
    id: "Z5",
    requisito: "O14",
    descricao: "favoritar offline passa a enfileirar a escrita",
    arquivo: OFFLINE_SESSAO,
    de: '  if (!online()) return { gravado: false, motivo: "sem_internet" };',
    para:
      "  if (!online()) {\n" +
      '    const fila = JSON.parse(localStorage.getItem("nutriscan:fila-offline") || "[]");\n' +
      '    localStorage.setItem("nutriscan:fila-offline", JSON.stringify([...fila, String(gravar)]));\n' +
      '    return { gravado: false, motivo: "sem_internet" };\n' +
      "  }",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram",
    banco: false,
  },
  {
    id: "Z5b",
    requisito: "O14",
    descricao: "a escrita passa a ser feita mesmo sem rede",
    arquivo: OFFLINE_SESSAO,
    de: '  if (!online()) return { gravado: false, motivo: "sem_internet" };',
    para: '  if (false) return { gravado: false, motivo: "sem_internet" };',
    suite: SUITE_OFFLINE,
    deveQuebrar: "O14 nenhuma escrita offline: favoritar e marcar alergia sem rede nao chamam o servidor, nao gravam e nao enfileiram",
    banco: false,
  },
  {
    id: "Z6",
    requisito: "O2",
    descricao: "produto ausente passa a voltar como resultado vazio que parece resposta",
    arquivo: OFFLINE_LOOKUP,
    de: "  if (!registro) return { estado: NAO_DISPONIVEL_OFFLINE, codigo };",
    para: "  if (!registro) return { estado: NO_APARELHO, codigo, guardadoEm: 0, produto: {} };",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O2 produto NAO guardado + sem rede: 'nao disponivel offline', explicito - nunca resultado vazio nem aproximado",
    banco: false,
  },
  {
    id: "Z7",
    requisito: "O7",
    descricao: "codigo invalido passa a consultar o cache",
    arquivo: OFFLINE_LOOKUP,
    de: "  if (preparado.estado === CODIGO_INVALIDO) return preparado;",
    para:
      "  if (preparado.estado === CODIGO_INVALIDO) {\n" +
      "    await cache.lerProduto(dono, String(entrada));\n" +
      "    return preparado;\n" +
      "  }",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O7 codigo invalido offline e recusado pela mesma funcao, ANTES de consultar o cache",
    banco: false,
  },
  {
    id: "Z8",
    requisito: "O8",
    descricao: "a chave do produto no aparelho deixa de ser a forma canonica",
    arquivo: OFFLINE_LOOKUP,
    de: '  return identidadeDoCodigo(String(codigo ?? "").trim());',
    para: '  return String(codigo ?? "").trim();',
    suite: SUITE_OFFLINE,
    deveQuebrar: "O8 UPC-A offline acha o produto guardado como EAN-13 - e o contrario",
    banco: false,
  },
  {
    id: "Z9",
    requisito: "O10",
    descricao: "a exclusao da conta deixa de limpar o cache",
    arquivo: OFFLINE_SESSAO,
    de: "  await cache.apagarContas();\n  return resposta;",
    para: "  return resposta;",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O10 exclusao de conta limpa o cache no aparelho - so depois de o servidor confirmar",
    banco: false,
  },
  {
    id: "Z10",
    requisito: "O12",
    descricao: "uma conta nova no aparelho deixa de apagar o cache da anterior",
    arquivo: OFFLINE_CACHE,
    de: "      await apagarOutrasContas(transacao, registro.dono);",
    para: "",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O12 o cache de A nao e legivel por B no mesmo aparelho",
    banco: false,
  },
  {
    id: "Z11",
    requisito: "O16",
    descricao: "dado expirado passa a ser servido como valido",
    arquivo: OFFLINE_LOOKUP,
    de: "  if (registro.expirado) return { estado: EXPIRADO_NO_APARELHO, codigo, guardadoEm: registro.guardadoEm };",
    para: "",
    suite: SUITE_OFFLINE,
    deveQuebrar: "O16 dado expirado nao e servido como valido: depois de 30 dias, e tratado como ausente, com o motivo",
    banco: false,
  },
  {
    id: "Z12",
    requisito: "O15",
    descricao: "uma sessao recusada pelo servidor (401) deixa de tirar o cache",
    arquivo: OFFLINE_SESSAO,
    de: '      await cache.apagarContas().catch(() => false);\n      return { tipo: "visitante", motivo: "sem_sessao" };',
    para: '      return { tipo: "visitante", motivo: "sem_sessao" };',
    suite: SUITE_OFFLINE,
    deveQuebrar: "O15 a sessao 'sem resposta' usa o perfil do aparelho, marcado; 401 tira o cache",
    banco: false,
  },
  {
    id: "Z13",
    requisito: "A11",
    descricao: "o gate perde o requisito offlineCache",
    arquivo: E2E_GATE,
    de: '    ["offlineCache", report.offlineCache === "PASSED"],\n',
    para: "",
    suite: SUITE_GATE,
    deveQuebrar: "A11: o modo strict tem exatamente 23 requisitos, os 22 da v0.10.0 mais offlineCache",
    banco: false,
  },
  // -------------------------------------------------------------------------
  // v0.12.0 - acessibilidade do alerta de alergia. AC1 (A1t), AC3 (A3t), AC5
  // (A5t), AC7 (A6t) e AC9 (A11) sao os obrigatorios; os demais travam o resto
  // da secao 6.
  // -------------------------------------------------------------------------
  {
    id: "AC1",
    requisito: "A1t",
    descricao: "o estado do veredito passa a ser comunicado so pela classe de cor (titulo igual nos quatro)",
    arquivo: VEREDITO_JSX,
    de: "        {tituloDoEstado(verdict)}\n      </p>",
    para: "        Verificação do app\n      </p>",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A1t sem cor, os quatro estados do veredito continuam distinguiveis por texto",
    banco: false,
  },
  {
    id: "AC2",
    requisito: "A2t",
    descricao: "a etiqueta de risco volta a ser so o nome do alergenico, sem o estado",
    arquivo: VEREDITO_JSX,
    de: "              {textoDoRisco(risk, verdict.status)}",
    para: "              {risk.label}",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A2t cada alergenico do veredito vem com o seu estado escrito",
    banco: false,
  },
  {
    id: "AC3",
    requisito: "A3t",
    descricao: "a origem do veredito volta a opacidade 0.85: o tom de tracos cai para 3.89:1",
    arquivo: CSS_V070,
    de: ".allergy-verdict-origin {\n  opacity: 1;\n}",
    para: ".allergy-verdict-origin {\n  opacity: 0.85;\n}",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3",
    banco: false,
  },
  {
    id: "AC4",
    requisito: "A3t",
    descricao: "a dica da busca do topo volta ao creme a 72%: 4.40:1",
    arquivo: CSS_V070,
    de: "  color: rgba(245, 242, 234, 0.8);\n  opacity: 1;",
    para: "  color: var(--chrome-ink-2);\n  opacity: 1;",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A3t contraste calculado dos tokens reais: texto 4.5, texto grande 3, indicador 3",
    banco: false,
  },
  {
    id: "AC5",
    requisito: "A5t",
    descricao: "a regiao de anuncio do veredito perde o aria-live",
    arquivo: ANUNCIO_JSX,
    de: " aria-live=\"polite\" aria-atomic=\"true\">",
    para: " aria-atomic=\"true\">",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro",
    banco: false,
  },
  {
    id: "AC6",
    requisito: "A5t",
    descricao: "o app deixa de montar a regiao de anuncio (ela nasceria junto com o texto)",
    arquivo: APP,
    de: "      <AnuncioDoVeredito texto={anuncio.texto} vez={anuncio.vez} />\n",
    para: "",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A5t a regiao de anuncio e polite, existe antes do veredito e recebe o estado primeiro",
    banco: false,
  },
  {
    id: "AC7",
    requisito: "A6t",
    descricao: "o veredito passa a ser renderizado depois do texto do modelo",
    arquivo: ASSISTENTE_JSX,
    de: "              {message.role === \"assistant\" && <AllergyVerdict verdict={message.verdict} />}\n              <p className={`chat-message ${message.role}`}>\n                {message.role === \"assistant\" && message.source && (\n                  <span className=\"chat-source\">\n                    {message.source === \"local\" ? \"Resposta local\" : \"Nutri IA\"}\n                  </span>\n                )}\n                {message.text}\n              </p>",
    para: "              <p className={`chat-message ${message.role}`}>\n                {message.role === \"assistant\" && message.source && (\n                  <span className=\"chat-source\">\n                    {message.source === \"local\" ? \"Resposta local\" : \"Nutri IA\"}\n                  </span>\n                )}\n                {message.text}\n              </p>\n              {message.role === \"assistant\" && <AllergyVerdict verdict={message.verdict} />}",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A6t no assistente, na tela do produto e na comparacao, o veredito vem antes",
    banco: false,
  },
  {
    id: "AC8",
    requisito: "A7t",
    descricao: "a coluna da comparacao perde o nome do produto no nome acessivel",
    arquivo: COMPARACAO_JSX,
    de: " produto: ${nomeDoProduto(produto)}`}>",
    para: " produto`}>",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A7t na comparacao, coluna, veredito e cabecalho de tabela dizem o nome do produto",
    banco: false,
  },
  {
    id: "AC9",
    requisito: "A11",
    descricao: "o botao de remover alergia cai para 20x20 px",
    arquivo: CSS_DESIGN,
    de: "  place-items: center;\n  width: 32px;\n  height: 32px;",
    para: "  place-items: center;\n  width: 20px;\n  height: 20px;",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais",
    banco: false,
  },
  {
    id: "AC10",
    requisito: "A11",
    descricao: "o botao 'Abrir este produto' da comparacao cai para 20px de altura",
    arquivo: CSS_V070,
    de: ".compare-col .secondary-button {\n  min-height: var(--touch);",
    para: ".compare-col .secondary-button {\n  min-height: 20px;",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A11 os alvos de toque do caminho do alerta tem 24x24 CSS px ou mais",
    banco: false,
  },
  {
    id: "AC11",
    requisito: "A9t",
    descricao: "o campo de codigo perde o anel de foco devolvido (fica o outline: none do design)",
    arquivo: CSS_V070,
    de: ".input-row input:focus-visible,\n.field-with-icon input:focus-visible,",
    para: ".field-with-icon input:focus-visible,",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A9t o anel de foco existe, tem 2px e nenhum campo do caminho o perde",
    banco: false,
  },
  {
    id: "AC12",
    requisito: "A10",
    descricao: "a folga de rolagem sob a barra de cima some",
    arquivo: CSS_V070,
    de: "  scroll-padding-top: var(--folga-do-topo, 9.5rem);\n",
    para: "",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A10 a folga de rolagem cobre a barra de cima e as abas, no celular e no computador",
    banco: false,
  },
  {
    id: "AC13",
    requisito: "A13",
    descricao: "a recusa do codigo na busca deixa de ser anunciada (sem role=alert)",
    arquivo: BUSCA_JSX,
    de: "          <p id={ID_ERRO} className=\"field-error\" role=\"alert\">",
    para: "          <p id={ID_ERRO} className=\"field-error\">",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A13 cada motivo de recusa e distinto, ligado ao campo e anunciado uma vez",
    banco: false,
  },
  {
    id: "AC14",
    requisito: "A17",
    descricao: "o nome do produto passa a entrar como HTML no rotulo acessivel do veredito",
    arquivo: VEREDITO_JSX,
    de: "{rotulo ? <span className=\"sr-only\">{`${rotulo}: `}</span> : null}",
    para: "{rotulo ? <span className=\"sr-only\" dangerouslySetInnerHTML={{ __html: `${rotulo}: ` }} /> : null}",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A17 nome de produto vindo da Open Food Facts chega como texto, nunca como HTML",
    banco: false,
  },
  {
    id: "AC15",
    requisito: "A8t",
    descricao: "o campo do assistente volta a usar disabled enquanto espera (o foco cai no <body>)",
    arquivo: ASSISTENTE_JSX,
    de: "            readOnly={assistantLoading}\n",
    para: "            disabled={assistantLoading}\n",
    suite: SUITE_ACESSIBILIDADE,
    deveQuebrar: "A8t todo controle do caminho do alerta e nativo, alcancavel e sem armadilha",
    banco: false,
  },
  // -------------------------------------------------------------------------
  // v0.13.0 - app instalavel e service worker. PW1/PW2 (P3), PW3/PW4 (P7),
  // PW5/PW6 (P9) e PW7/PW8 (P12) sao os obrigatorios; os demais travam o resto
  // das secoes 5, 6 e 8.2.
  // -------------------------------------------------------------------------
  {
    id: "PW1",
    requisito: "P3",
    descricao: "a regra de rota passa a cachear /api/ (cache primeiro, como arquivo do shell)",
    arquivo: SW_POLITICA,
    de: "  if (ehDaApi(url)) return IGNORAR;\n",
    para: "  if (ehDaApi(url)) return DO_SHELL;\n",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada",
    banco: false,
  },
  {
    id: "PW2",
    requisito: "P3",
    descricao: "a gravacao deixa de recusar /api/ (a segunda camada)",
    arquivo: SW_POLITICA,
    de: "  if (ehDaApi(url)) return false;\n  if (!ehDoShell(url, shell)) return false;\n",
    para: "  if (!ehDoShell(url, shell)) return false;\n",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada",
    banco: false,
  },
  {
    id: "PW3",
    requisito: "P7",
    descricao: "o logout (a volta a visitante) deixa de limpar o Cache Storage",
    arquivo: APP,
    de: "    limparCacheStorage();\n    sessaoDoAparelhoRef.current = null;",
    para: "    sessaoDoAparelhoRef.current = null;",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P7 logout limpa o Cache Storage e o IndexedDB - os dois conferidos",
    banco: false,
  },
  {
    id: "PW4",
    requisito: "P7",
    descricao: "a limpeza deixa de apagar os caches que nao sao do shell",
    arquivo: SW_LIMPEZA,
    de: "        await cachesApi.delete(nome);\n",
    para: "",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P7 logout limpa o Cache Storage e o IndexedDB - os dois conferidos",
    banco: false,
  },
  {
    id: "PW5",
    requisito: "P9",
    descricao: "a chave do cache deixa de incluir a versao do app",
    arquivo: SW_POLITICA,
    de: "  return `${PREFIXO_DO_CACHE}${versao}`;",
    para: "  return PREFIXO_DO_CACHE;",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P9 versao nova publicada: o cache antigo e descartado e a versao nova passa a ser servida",
    banco: false,
  },
  {
    id: "PW6",
    requisito: "P9",
    descricao: "a versao nova deixa de apagar o cache da antiga ao assumir",
    arquivo: SW_CODIGO,
    de: "        if (nome !== CACHE) await caches.delete(nome);\n",
    para: "",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P9 versao nova publicada: o cache antigo e descartado e a versao nova passa a ser servida",
    banco: false,
  },
  {
    id: "PW7",
    requisito: "P12",
    descricao: "o app passa a depender do service worker para aparecer",
    arquivo: MAIN_JSX,
    de: "createRoot(document.getElementById(\"root\")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n);",
    para: "serviceWorkerDoApp.registrar({ ativo: true }).then((resultado) => {\n  if (resultado.estado !== \"registrado\") return;\n  createRoot(document.getElementById(\"root\")).render(\n    <React.StrictMode>\n      <App />\n    </React.StrictMode>,\n  );\n});",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P12 com o registro do service worker falhando, o app carrega e funciona",
    banco: false,
  },
  {
    id: "PW8",
    requisito: "P12",
    descricao: "o registro deixa a falha escapar como erro",
    arquivo: SW_REGISTRO,
    de: "        .catch((erro) => ({ estado: \"falhou\", motivo: String(erro?.message || erro) }));\n",
    para: "        ;\n",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P12 com o registro do service worker falhando, o app carrega e funciona",
    banco: false,
  },
  {
    id: "PW9",
    requisito: "P4",
    descricao: "resposta com Set-Cookie passa a poder ser guardada",
    arquivo: SW_POLITICA,
    de: "  if (cabecalho(resposta, \"set-cookie\")) return false;\n",
    para: "",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P4 resposta com Set-Cookie nunca e guardada - nem de /api/, nem de arquivo do shell",
    banco: false,
  },
  {
    id: "PW10",
    requisito: "P11",
    descricao: "a versao nova passa a assumir sozinha na instalacao",
    arquivo: SW_CODIGO,
    de: "  // Sem skipWaiting aqui:",
    para: "  self.skipWaiting();\n  // Sem skipWaiting aqui:",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P11 a versao nova nunca assume sozinha na instalacao - espera",
    banco: false,
  },
  {
    id: "PW11",
    requisito: "P11",
    descricao: "a pagina passa a recarregar em qualquer troca de controle",
    arquivo: SW_REGISTRO,
    de: "        if (!recarregarQuandoTrocar) return;\n",
    para: "",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P11 a pagina nunca recarrega sozinha: so pelo toque em Atualizar",
    banco: false,
  },
  {
    id: "PW12",
    requisito: "P3",
    descricao: "a regra de /api/ passa a diferenciar maiuscula (/API/ escaparia)",
    arquivo: SW_POLITICA,
    de: "  return url.pathname.toLowerCase();",
    para: "  return url.pathname;",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P3 a regra: nenhuma rota de /api/ e interceptada, e nenhuma pode ser gravada",
    banco: false,
  },
  {
    id: "PW13",
    requisito: "P16",
    descricao: "o service worker passa a interceptar outra origem",
    arquivo: SW_POLITICA,
    de: "  if (url.origin !== origem) return IGNORAR;\n",
    para: "",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P16 escopo '/': o service worker so intercepta a pagina e os arquivos do build",
    banco: false,
  },
  {
    id: "PW14",
    requisito: "P1",
    descricao: "sem rede, a pagina deixa de cair no shell guardado",
    arquivo: SW_CODIGO,
    de: "    if (guardada) return guardada;\n",
    para: "",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P1 sem rede, o HTML, o JavaScript e o CSS do app vem do cache",
    banco: false,
  },
  {
    id: "PW15",
    requisito: "P5",
    descricao: "a exportacao passa a poder ser guardada se estiver na lista do shell",
    arquivo: SW_POLITICA,
    de: "  return caminho === \"/api\" || caminho.startsWith(\"/api/\");",
    para: "  return (caminho === \"/api\" || caminho.startsWith(\"/api/\")) && !caminho.includes(\"export\");",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P5 /api/account/export nunca e guardada, em nenhuma grafia",
    banco: false,
  },
  {
    id: "PW16",
    requisito: "P15",
    descricao: "o manifesto passa a declarar um icone que nao existe",
    arquivo: MANIFESTO,
    de: "\"src\": \"/icon-512.png\"",
    para: "\"src\": \"/icon-1024.png\"",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P15 todo icone declarado existe no projeto, no tamanho declarado",
    banco: false,
  },
  {
    id: "PW17",
    requisito: "P17",
    descricao: "todas as fontes passam a ser pre-carregadas (cirilico, WOFF antigo...)",
    arquivo: SW_MONTAR,
    de: "  return /\\.woff2$/.test(caminho) && /-latin-(ext-)?\\d{3}-normal-/.test(caminho);",
    para: "  return /\\.woff2?$/.test(caminho);",
    suite: SUITE_SERVICE_WORKER,
    deveQuebrar: "P17 o tamanho do shell e reportado e fica dentro do teto",
    banco: false,
  },
  {
    id: "PW18",
    requisito: "8.2",
    descricao: "o D12 passa a aceitar service worker com cache longo",
    arquivo: VERIFY_DEPLOY,
    de: "  const semCacheLongo = /no-cache|no-store/i.test(cacheControl) || (maxAge && Number(maxAge[1]) === 0);",
    para: "  const semCacheLongo = true;",
    suite: SUITE_DEPLOY,
    deveQuebrar: "P11 cada defeito derruba o seu subgate e o agregado",
    banco: false,
  },
  {
    id: "PW19",
    requisito: "8.2",
    descricao: "o D10 deixa de conferir se o icone e servido",
    arquivo: VERIFY_DEPLOY,
    de: "    if (resposta.status !== 200 || !/^image\\//i.test(tipo)) problemas.push(",
    para: "    if (false) problemas.push(",
    suite: SUITE_DEPLOY,
    deveQuebrar: "P11 cada defeito derruba o seu subgate e o agregado",
    banco: false,
  },
  {
    id: "PW20",
    requisito: "8.2",
    descricao: "o backend volta a servir o sw.js com o cache de 1 hora",
    arquivo: APP_BACKEND,
    de: "    res.setHeader(\"Content-Type\", \"text/javascript; charset=utf-8\");\n    res.setHeader(\"Cache-Control\", \"no-cache\");",
    para: "    res.setHeader(\"Content-Type\", \"text/javascript; charset=utf-8\");",
    suite: SUITE_DEPLOY,
    deveQuebrar: "D9 a D12 contra o backend REAL: manifesto, icones e service worker servidos certo",
    banco: false,
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
