# Changelog

## NutriScan v0.6.7 - 2026-08-16

Correcoes da auditoria do gauntlet-loop sobre a preparacao de producao. O
supervisor REPROVOU a v0.6.6 com nota 2 em safety, e o motivo mais grave nao foi
codigo: a suite de testes escreveu no banco de producao do usuario.

- backend/tests/integration.test.js parou de se auto-habilitar so por encontrar
  DATABASE_URL. Rodar migrations e DELETE em users agora exige
  RUN_DB_INTEGRATION_TESTS=true. Sem isso, quem tivesse a string de producao no
  .env escreveria no banco real ao rodar npm test, sem perceber. Foi o que
  aconteceu: a suite rodou varias vezes contra o Neon e deixou uma linha de
  teste em producao, removida manualmente.
- Corrigido o contrato da API sob o fallback de SPA: o roteamento do Express nao
  diferencia maiusculas, mas o guarda diferenciava, entao /API/naoexiste e /api
  devolviam o HTML do app com status 200 em vez de erro JSON.
- createApp aceita options.distDir, permitindo testar os dois modos, com e sem
  build, sem depender de npm run build.
- Adicionado backend/tests/productionServing.test.js cobrindo o codigo que
  nasceu sem teste: app servido, assets, fallback de SPA, contrato da API em
  varias caixas, metodo diferente de GET, ausencia de build e CSP sem
  afrouxamento. Validado por mutacao.

## NutriScan v0.6.6 - 2026-08-15

Endurecimento do gate E2E a partir da auditoria do gauntlet-loop sobre a v0.6.5.
O supervisor aprovou a v0.6.5 (notas 9/9/9/8/9), mas apontou um vao estrutural e
mutantes sobreviventes na superficie de decisao. Ambos foram corrigidos.

- `verify:e2e` passa a recusar `E2E_BASE_URL`. O gate tem que subir e provar o
  backend deste repositorio; apontar para uma API externa transformava o PASS em
  prova de outro servidor, que pode fabricar a resposta da IA. Para validar
  staging, `npm run e2e:strict` continua aceitando a variavel.
- Modo strict do runner passa a exigir `backendProcess === "STARTED_BY_RUNNER"`.
- Extraidas para `scripts/lib/e2eGate.js`, agora testaveis sem subir processo:
  a lista de requisitos do modo strict, a validacao de forma da resposta real da
  IA, a identidade das etapas do gate e o proprio loop de execucao (`runGate`,
  com executor injetado).
- Adicionados testes E e F cobrindo: recusa de alvo externo, exigencia de
  backend proprio, rejeicao de resposta fabricada, identidade das etapas, parada
  na primeira falha com o codigo real gravado e repasse de Claude real ao
  executor.
- Mutacao: os mutantes que sobreviviam na v0.6.5 agora morrem — assert de
  `source=anthropic` neutralizado, checagem de completude strict apagada, perna
  generica promovida a prova completa, etapa `e2e:strict` removida do gate,
  ambiente sem `E2E_REQUIRE_ANTHROPIC` e barreira de `E2E_BASE_URL` removida.
  O mutante que grava exit code 0 para etapa que falhou sobreviveu ao primeiro
  teste escrito e so morreu depois que o teste passou a conferir o codigo
  gravado, e nao apenas a quantidade de etapas.

## NutriScan v0.6.5 - 2026-08-15

Hotfix do gate E2E. A migracao da v0.6.3 deixou residuo executavel da
arquitetura antiga em `scripts/verify-e2e.js`, e a varredura que declarou "zero
ocorrencias ativas" era sensivel a maiusculas, entao passou reto pela forma
`OPENAI` em caixa alta. O gate podia terminar sem nunca exigir Claude real.

- Corrigido `scripts/verify-e2e.js`: nenhuma logica depende mais de
  `RUN_OPENAI_INTEGRATION_TESTS`. O gate agora exige
  `RUN_ANTHROPIC_INTEGRATION_TESTS=true` e recusa antes de subir qualquer
  processo quando a flag nao esta habilitada (`FAIL BEFORE CALL`, exit != 0).
- O gate passa `E2E_REQUIRE_ANTHROPIC=true` ao runner, tornando Claude real
  obrigatorio: `verify:e2e` nao retorna PASS sem chamada real validada.
- Corrigida a mensagem de `scripts/e2e-real.js`, que citava `OPENAI_API_KEY` no
  fluxo Anthropic; agora cita `ANTHROPIC_API_KEY`.
- Corrigido comentario residual de `scripts/verify-release.js`.
- Extraida a logica do gate para `scripts/lib/e2eGate.js`, testavel sem I/O.
- Adicionado `backend/tests/e2eGate.test.js` com regressao A/B/C/D:
  sem a flag o gate falha e nenhuma etapa sobe; com a flag e sem chave falha
  antes da chamada citando a variavel correta; nenhum script executavel cita a
  flag antiga; e PASS exige pre-condicao autorizada mais todas as etapas em
  exit 0. Os testes foram validados por mutacao: reintroduzir o residuo derruba
  4 deles.
- Preservados de proposito: o historico do CHANGELOG e os padroes de chave
  antiga do secret scan, que existem para achar credencial esquecida.
- Corrigida no AUDIT_REPORT a afirmacao falsa de varredura completa da v0.6.3.

## NutriScan v0.6.4 - 2026-08-15

Correcao de dois defeitos da v0.6.3 encontrados pelo gauntlet-loop, o metodo de
equipe de subagentes com supervisor adversarial adotado como padrao do projeto.
Ambos passavam pela suite de 64 testes sem serem detectados.

- Corrigido mapeamento de timeout do provedor: as classes de erro do SDK nao
  definem `name` (toda instancia herda `name === "Error"`, com `status` e `code`
  indefinidos), entao o ramo que detectava timeout por nome era inalcancavel e um
  timeout real virava `AI_UNAVAILABLE` 503 em vez de `AI_TIMEOUT` 504. Agora a
  deteccao usa `instanceof Anthropic.APIConnectionTimeoutError` e
  `instanceof Anthropic.APIUserAbortError`, com as checagens de status e code
  mantidas para transporte generico fora do SDK.
- Corrigido teste que ficava verde defendendo esse ramo morto: ele alimentava
  `mapProviderError` com objetos sinteticos que o SDK nunca produz. Agora usa
  instancias reais (`new Anthropic.APIConnectionTimeoutError()`,
  `Anthropic.APIError.generate(...)`) e trava o comportamento com um assert
  explicito de que o SDK nao define `name`.
- Corrigida guarda de `stop_reason`: resposta sem `stop_reason` passava
  fail-open e virava sucesso. Agora so `end_turn` e `stop_sequence` sao aceitos;
  ausente, nulo ou vazio vira `AI_BAD_RESPONSE`.
- Adicionado teste de regressao para resposta sem `stop_reason`.
- Documentacao de `AI_TIMEOUT` em `docs/AI_ASSISTANT.md`, `docs/API.md` e
  `AUDIT_REPORT.md` volta a descrever o comportamento real, sem edicao de texto:
  o conserto do codigo e que tornou as tres afirmacoes verdadeiras.
- Adotado o gauntlet-loop como metodo padrao do projeto, com o padrao em
  `.claude/skills/gauntlet-loop/SKILL.md`, a orquestracao em
  `.claude/workflows/gauntlet-loop.js` e a regra permanente em `CLAUDE.md`.

## NutriScan v0.6.3 - 2026-08-14

Migracao oficial do provedor de IA: OpenAI -> Anthropic Claude. PostgreSQL,
autenticacao, sessoes, motor deterministico, adapters e visual nao mudaram.

- Substituido o SDK `openai` pelo SDK oficial `@anthropic-ai/sdk` no backend.
- Criado `backend/src/ai/anthropicClient.js`; removido `openaiClient.js`.
- Assistente migrado para a Anthropic Messages API com `client.messages.create`.
- Modelo padrao `claude-sonnet-5`, configuravel por `ANTHROPIC_MODEL` e
  centralizado em `backend/src/config/env.js`.
- Instrucoes privilegiadas passaram para o parametro `system`; a conversa vira
  mensagens `user`/`assistant` reais, sem `role: "system"` dentro de `messages`.
- Structured Outputs por `output_config.format` com `type: "json_schema"`,
  mantendo a validacao Zod de `assistantResponseSchema` no backend.
- Tratamento explicito de `stop_reason`: `refusal` vira `AI_REFUSAL`,
  `max_tokens` vira `AI_INCOMPLETE` e qualquer outro encerramento anormal vira
  `AI_BAD_RESPONSE`, mesmo com corpo aparentemente valido.
- Leitura de content blocks por tipo, sem assumir `content[0]`.
- Removida a moderacao remota `omni-moderation-latest`; nenhum provedor foi
  mantido so para moderar. As protecoes deterministicas locais continuam.
- Codigos de erro da API publica seguem neutros de provedor (`AI_*`).
- Variaveis de ambiente migradas para `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`,
  `ANTHROPIC_TIMEOUT_MS` e `ANTHROPIC_MAX_OUTPUT_TOKENS`.
- Flag de teste real migrada para `RUN_ANTHROPIC_INTEGRATION_TESTS`.
- Health passou a informar `aiProvider`, sem revelar chave.
- Doctor e doctor:e2e passaram a exigir `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`.
- Secret scan ganhou padroes `sk-ant-` e `ANTHROPIC_API_KEY=`.
- Frontend continua chamando apenas a API do NutriScan e agora trata a origem da
  resposta de forma agnostica: qualquer origem diferente de `local` e Nutri IA.
- Fallback local preservado, incluindo `AI_NOT_CONFIGURED`.
- Testes novos do client: sucesso, timeout, 429, 5xx, JSON invalido, schema
  invalido, stop_reason anormal e leitura de content blocks fora de ordem.

## NutriScan v0.6.2 - 2026-08-14

Checkpoint de tentativa de E2E real. O ambiente nao possui PostgreSQL nem
OpenAI, entao o gate `verify:e2e` permanece BLOQUEADO e a v0.7.0 nao foi
iniciada.

- Executada auditoria de ambiente: sem Docker, sem PostgreSQL instalado ou em
  servico, sem distro WSL, sem `DATABASE_URL` e sem `OPENAI_API_KEY`.
- Nenhum software de sistema foi instalado e nenhuma credencial foi inventada.
- Executado o que o ambiente permite: doctor, `e2e:real`, motor deterministico,
  privacidade do payload, fallback, health, build, testes e audits.
- Confirmado que `doctor:e2e` e `e2e:strict` recusam corretamente o ambiente
  incompleto, com exit code diferente de zero.
- Confirmado FAIL BEFORE CALL com `RUN_OPENAI_INTEGRATION_TESTS=true` sem chave:
  nenhuma chamada paga foi feita.
- Corrigido residuo de documentacao: `backend/README.md` anunciava v0.6.0 e
  trazia exemplos de health com `"version": "0.6.0"`.
- Adicionado teste de regressao de versao cobrindo `package.json`,
  `backend/package.json`, os dois lockfiles, `APP_VERSION`, cabecalhos da
  documentacao, exemplos de health e secao do CHANGELOG.
- Atualizada a versao para 0.6.2 em pacotes, lockfiles, health e documentacao.

## NutriScan v0.6.1 - 2026-08-13

- Corrigido `scripts/doctor.js`, que importava `backend/src/config/env.js` e `pg`
  no topo e podia lancar `ERR_MODULE_NOT_FOUND` antes de exibir
  `[WARN] Backend dependencies`.
- Doctor agora inicia usando apenas built-ins do Node.js e funciona em copia
  recem-extraida do ZIP, sem `node_modules` e sem `backend/node_modules`.
- Adicionado probe de `.env` com built-ins para diagnosticar ambiente antes de
  `dotenv` existir, sem imprimir valores.
- Dependencias passam a ser verificadas por resolucao real de modulos
  (`vite`, `react`, `react-dom`, `express`, `pg`, `dotenv`, `openai`);
  `node_modules` incompleto deixa de ser considerado `OK`.
- Adicionado modo strict do Doctor via `npm run doctor:e2e`, exigindo
  dependencias, `DATABASE_URL`, PostgreSQL, migrations, `OPENAI_API_KEY` e
  `OPENAI_MODEL`, com exit code diferente de zero quando faltar requisito.
- Doctor strict compara os arquivos de `backend/migrations/` com o conteudo de
  `schema_migrations` em vez de apenas checar a existencia da tabela.
- Runner E2E passa a subir e encerrar um backend temporario automaticamente,
  com espera de `/health` limitada por timeout e encerramento garantido em
  sucesso, falha, excecao e SIGINT.
- Runner E2E respeita `E2E_BASE_URL` e nao inicia processo local ao usar
  staging, container ou servidor externo.
- Adicionado `npm run e2e:strict`, onde PostgreSQL ausente vira `FAIL` em vez de
  `SKIPPED`.
- Adicionado `npm run verify:e2e` como gate de infraestrutura real
  (`doctor:e2e` seguido de `e2e:strict`).
- Documentada a semantica de `npm run verify:release` como verificacao de
  build/test/audit/secret, que nao equivale a E2E aprovado.
- Adicionado fluxo E2E autenticado do assistente cobrindo perfil no PostgreSQL,
  alergia, requisicao autenticada, snapshot deterministico e payload da IA.
- Adicionada prova de autoridade do perfil: conta com `milk` e request com
  `guestAllergies: ["soy"]` mantem `milk` como perfil oficial.
- Adicionado teste real opcional da OpenAI com produto em conflito, limitado a
  duas chamadas por execucao e sempre condicionado a
  `RUN_OPENAI_INTEGRATION_TESTS=true`, com falha antes da chamada quando exigida
  sem autorizacao.
- Substituida a inspecao de sessao que retornava `rawTokenColumnExists: false`
  fixo por consulta real a `information_schema.columns`.
- Adicionado teste automatizado do fallback: `AI_NOT_CONFIGURED` passa a ser
  decidido por funcao pura e resulta em resposta local.
- Cleanup do E2E passa a usar `DELETE FROM users WHERE email = ANY($1::text[])`,
  restrito aos e-mails temporarios da execucao.
- Adicionado relatorio sanitizado opcional `E2E_LAST_RUN.json`, ignorado pelo
  Git e fora do ZIP.

## NutriScan v0.6.0 - 2026-08-13

- Adicionado `npm run doctor` para diagnostico de ambiente sem revelar secrets.
- Adicionado `npm run e2e:real` para validar uma API real rodando.
- Adicionado cookie jar simples no runner E2E para simular dispositivos A e B.
- Adicionado fluxo E2E para health, auth, perfil, alergias, multi-dispositivo,
  isolamento, logout, motor deterministico, assistente e privacidade.
- Adicionado teste OpenAI real opcional, controlado por
  `RUN_OPENAI_INTEGRATION_TESTS=true`.
- Adicionado `npm run verify:release` com doctor, build, testes, audits e secret
  scan em Node cross-platform.
- Adicionado `E2E_REPORT.md` sanitizado.
- Mantido PostgreSQL real com skip honesto quando `DATABASE_URL` nao esta
  configurado.

## NutriScan v0.5.3 - 2026-08-13

- Corrigida semantica do campo `traces`, que agora e tratado como traco pela
  origem do dado.
- Separados `ingredients`, `allergens` e `traces` no adapter compartilhado.
- `ingredients` continua usando parser contextual.
- `allergens` textual passa a ser evidencia declarada de `contains`.
- `traces` textual ou array passa a ser evidencia declarada de `traces`.
- Corrigido contexto enviado pelo frontend para nao substituir `allergens` por
  `allergens_tags` nem `traces` por `traces_tags`.
- Preservada precedencia `contains > traces > none`.
- Atualizado snapshot da IA para refletir corretamente `possibleTraces`.
- Expandida matriz de regressao para 50+ cenarios.

## NutriScan v0.5.2 - 2026-08-13

- Corrigidos falsos negativos causados por remocao global de trechos negados.
- Implementada classificacao por ocorrencia de termo alergico.
- Corrigido escopo de `pode conter` para nao contaminar sentencas seguintes.
- Preservada precedencia `contains > traces > none`.
- Preservadas exclusoes vegetais sem apagar leite real em outra ocorrencia.
- Corrigidos casos `sem lactose e contem leite`, `sem gluten mas contem trigo`,
  `sem lactose com whey` e `nao contem leite mas pode conter leite`.
- Revisadas negative labels para nunca sobrescrever tag positiva ou ingrediente
  positivo.
- Expandida suite deterministica para mais de 40 cenarios.
- Expandido teste de consistencia frontend/backend para a matriz v0.5.2.
- Adicionados testes de adapters para ingredientes, tags, traces e labels.
- Ajustado parsing OpenAI para priorizar `refusal` e `incomplete` antes de
  `output_parsed`.

## NutriScan v0.5.1 - 2026-08-13

- Criado motor deterministico unico de alergias em `shared/`.
- Eliminada divergencia entre classificacao do frontend e snapshot do backend.
- Centralizadas definicoes canonicas de alergias e normalizacao de texto.
- Refatorado frontend para usar `shared/allergenEngine.js`.
- Refatorado backend para usar o mesmo motor no contexto da IA.
- Corrigidos cenarios de negacao como `sem lactose` e `nao contem leite`.
- Corrigidas exclusoes como `leite de coco`, `bebida vegetal` e `manteiga de cacau`.
- Corrigida separacao entre `contains` e `traces`.
- Expandido contexto de produto enviado ao backend com labels, tags e variantes de ingredientes.
- Adicionada validacao Zod para resposta estruturada da OpenAI.
- Adicionado tratamento explicito para `AI_REFUSAL`, `AI_INCOMPLETE`, `AI_CONTENT_FILTERED` e `AI_SCHEMA_INVALID`.
- Melhoradas heuristicas de emergencia alergica.
- Melhorada heuristica de fora de escopo para nao bloquear pergunta nutricional apenas por citar Instagram.
- Adicionados testes de consistencia frontend/backend com mais de 15 cenarios.
- Adicionados testes de prompt injection em produto, snapshot contains/traces e mocks da Responses API.

## NutriScan v0.5.0 - 2026-08-13

- Implementado Nutri Assistente com IA generativa via backend.
- Adicionado SDK oficial `openai` no backend.
- Criado endpoint `POST /api/assistant/chat` com autenticacao opcional.
- Integrada OpenAI Responses API com `store: false`.
- Adicionado modelo configuravel por `OPENAI_MODEL`.
- Adicionado timeout e limite de saida configuraveis.
- Adicionado contexto minimo de produto para a IA.
- Adicionado contexto de alergias com fonte oficial no PostgreSQL para usuarios logados.
- Adicionado snapshot deterministico de alergias para a IA explicar, sem substituir o motor do NutriScan.
- Adicionada moderacao da entrada quando OpenAI estiver configurada.
- Adicionados mapeamentos seguros para erros da IA.
- Mantido fallback local baseado em regras quando IA falha ou nao esta configurada.
- Adicionados testes de prompt injection, validacao, contexto, fallback e mock da Responses API.
- Adicionado teste real opcional da OpenAI, desligado por padrao.
- Corrigida condicao residual em que resposta antiga de alergias podia sobrescrever visualmente uma intencao nova.
- Adicionada documentacao `docs/AI_ASSISTANT.md`.

## NutriScan v0.4.1 - 2026-08-13

- Adicionado carregamento real de `backend/.env` com caminho absoluto.
- Mantida prioridade das variaveis do sistema sobre o `.env` local.
- Validado `PORT`, `SESSION_TTL_DAYS`, `DATABASE_SSL` e `NODE_ENV`.
- Atualizado health para `ok`, `connected`, `not_configured` e `degraded`.
- Corrigido frontend para voltar ao modo visitante em `401 UNAUTHENTICATED`.
- Centralizada a restauracao do visitante.
- Corrigido logout para ser idempotente e limpar cookie mesmo sem sessao valida.
- Centralizada extracao de token por cookie ou `Authorization: Bearer`.
- Reduzida limpeza global de sessoes expiradas em toda chamada autenticada.
- Protegido `last_used_at` para nao quebrar uma sessao valida por falha secundaria.
- Adicionada fila sequencial para salvar alergias sem race condition.
- Adicionado Docker Compose opcional para PostgreSQL local.
- Adicionados testes de `.env`, health, logout e integracao PostgreSQL com skip honesto.
- Atualizada documentacao de API, arquitetura e ambiente.

## NutriScan v0.4.0 - 2026-08-13

- Adicionado backend Express em `backend/`.
- Adicionado PostgreSQL com migracao inicial para `users`, `user_allergies`,
  `sessions` e `schema_migrations`.
- Adicionado cadastro, login, logout e `/api/auth/me`.
- Adicionado perfil com leitura e atualizacao de alergias.
- Substituido fluxo de conta local por autenticacao via API.
- Mantido modo visitante com alergias locais no navegador.
- Adicionada migracao suave de contas antigas do navegador quando o usuario
  tenta entrar com credenciais locais existentes.
- Removida dependencia de chave OpenAI no frontend.
- Adicionado proxy do Vite para `/api`.
- Adicionados testes unitarios do backend para seguranca e validacao.
- Adicionada documentacao de API e arquitetura.

## v0.3.1 - Hotfix de armazenamento local

- Isolamento de alergias entre visitante e usuario local.
- Mais protecoes contra falhas de `localStorage`.
- Auditoria do fluxo de conta local.

## v0.3.0 - Interface modular

- Paginas separadas para tela principal, consulta, scan, alergias, assistente,
  conta e guia.
- Assistente local sem consumo de token.
- Scanner com suporte a camera e busca manual.
