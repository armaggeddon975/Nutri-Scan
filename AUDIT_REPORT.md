# Relatorio de Auditoria - NutriVa v0.6.8

Data: 2026-08-27

## Auditoria externa independente da v0.6.7

Um auditor externo instalou PostgreSQL real, rodou a suite inteira contra ele
(84 testes, 83 pass, 1 skip, 0 fail), executou a bateria adversarial do gate
`verify:e2e` e escreveu exploits proprios.

Resultado: **BLOQUEADO** por um defeito CRITICO, mais tres achados menores.

Confirmado como correto e nao alterado nesta versao: ausencia de residuo
executavel de OpenAI, gate `verify:e2e` fail-closed nas quatro variacoes
testadas, guarda `RUN_DB_INTEGRATION_TESTS`, ausencia de `ANTHROPIC_API_KEY` no
bundle de producao, identidade derivada da sessao, payload sem dado sensivel, e
instrucoes privilegiadas isoladas em `system`.

## C1 - CRITICO - resposta do modelo substituia o veredito deterministico

### Causa raiz

A regra do projeto e explicita: o motor deterministico e a autoridade sobre
conflito de alergia, e nenhuma resposta do modelo pode substituir esse
resultado. Ate a v0.6.7, essa autoridade existia **apenas como uma frase no
system prompt**.

`parseStructuredResponse` validava `stop_reason`, JSON e schema Zod e retornava
os campos do modelo com `source: "anthropic"` - texto e nivel de risco vindos da
IA, sem nenhuma reconciliacao com o `allergySnapshot` que
`buildAssistantContext` ja tinha produzido.

Agravante: `src/pages/Assistant/AssistantPage.jsx` nao exibia veredito
deterministico algum. O banner do motor so existia em `ProductAnalysis.jsx`, que
e outra superficie. Na tela do Assistente, o texto do modelo era o unico sinal
de alergenico que o usuario recebia.

### Exploit, reproduzido antes da correcao

```text
produto  Leite em Po Integral, ingredients_text "leite em po integral",
         allergens ["milk"]
perfil   ["milk"]
```

Saida real, com o cliente Anthropic substituido por um mock que devolve schema
valido:

```text
MOTOR DETERMINISTICO
  hasDeclaredConflict : true
  detectedConflicts   : ["milk"]

RESPOSTA ENTREGUE AO USUARIO
{
  "answer": "Este produto NAO contem leite e e totalmente seguro para voce.
             Pode consumir sem preocupacao.",
  "category": "allergy",
  "safety": "normal",
  "usedProductContext": true,
  "source": "anthropic"
}

VEREDITO DETERMINISTICO NA RESPOSTA : NAO
SAFETY ENTREGUE                     : normal
EXPLOIT                             : FUNCIONA - falso seguro entregue
```

### Correcao estrutural

O veredito deixou de ser algo pedido ao modelo e virou campo autoral do
servidor.

```text
shared/allergyVerdict.js                      novo, autoridade do veredito
backend/src/ai/assistantPrompt.js             schema strict, prompt ajustado
backend/src/ai/assistantService.js            ponto unico de saida, piso, log
src/components/assistant/AllergyVerdict.jsx   novo, bloco deterministico na UI
src/pages/Assistant/AssistantPage.jsx         veredito acima do texto do modelo
src/App.jsx                                   veredito tambem no fallback local
src/styles.css                                estilos do bloco
```

Duas barreiras independentes impedem o modelo de escrever o campo:

1. `assistantResponseSchema` passou a ser estrito. Qualquer chave fora do
   contrato - `allergyVerdict` inclusive - rejeita a resposta inteira com
   `AI_SCHEMA_INVALID`. A escolha foi rejeitar, e nao descartar em silencio,
   porque o projeto e fail-closed em checagem de seguranca.
2. `applyAllergyAuthority` desestrutura e descarta qualquer `allergyVerdict` da
   resposta do modelo antes de escrever o do motor.

Piso de risco: com `status: "conflict"`, `safety` nunca sai `normal`. A elevacao
e por codigo e so sobe - `urgent` permanece `urgent`. O alerta em texto e
escrito pelo servidor, separado de `answer`, e nao passa pelo modelo.

`finalizeAssistantResponse` e o ponto unico de saida do endpoint. As respostas
locais de protecao passam por ele tambem, entao a invariante vale para toda
resposta do endpoint, nao apenas para a da IA.

Traco declarado (`status: "traces"`) recebe alerta proprio mas nao altera o
nivel de risco: `traces` significa "pode conter", e trata-lo como evidencia
declarada esvaziaria a distincao que o motor faz.

Tentativa de minimizacao - conflito declarado com o modelo respondendo `normal`
- vira contador e log estruturado, sem mensagem, sem identificador de usuario,
sem e-mail e sem chave.

### Depois da correcao

```text
RESPOSTA ENTREGUE AO USUARIO
{
  "answer": "Este produto NAO contem leite e e totalmente seguro para voce...",
  "category": "allergy",
  "safety": "caution",
  "source": "anthropic",
  "allergyVerdict": {
    "status": "conflict",
    "source": "deterministic_engine",
    "conflicts": [{ "id": "milk", "label": "Leite/lactose" }],
    "profileSource": "request",
    "alert": "Alerta do NutriVa: este produto tem Leite/lactose no seu
              perfil de alergias...",
    "minimumSafety": "caution",
    "safetyFloorApplied": true
  }
}

log: {"event":"assistant.allergy_minimization_attempt","conflicts":["milk"],
      "modelSafety":"normal","enforcedSafety":"caution","total":1}

VEREDITO DETERMINISTICO NA RESPOSTA : sim
SAFETY ENTREGUE                     : caution
EXPLOIT                             : bloqueado
```

O texto do modelo continua sendo entregue. Ele e explicacao, nao veredito - e
agora aparece abaixo de um bloco que o contradiz quando ele erra.

### Validacao por mutacao

Quatro mutantes, todos mortos:

```text
M1  remover o piso de risco em applyAllergyAuthority      4 testes falharam
M2  remover o modo estrito do assistantResponseSchema     1 teste falhou
M3  deixar o allergyVerdict do modelo vencer o do motor   1 teste falhou
M4  remover o bloco AllergyVerdict de AssistantPage       3 testes falharam
```

Nenhum sobrevivente. O teste de interface compila o JSX do componente real com
esbuild e renderiza de verdade, entao ele morre junto com o alerta.

## M1 - E2E_REPORT com numeros da versao anterior

O documento declarava `total 79 | passed 73 | skipped 6` enquanto a medicao real
da v0.6.7 era `84 | 78 | 6`, e trazia data 2026-08-15 contra 2026-08-16 no
CHANGELOG da mesma versao. Era o relatorio da v0.6.6 com o titulo trocado. O
teste de versao que ja existia nao pegou porque so olhava o cabecalho.

Corrigido com regeneracao a partir de execucao real e com
`backend/tests/reportConsistency.test.js`, que compara a data declarada nos
relatorios com a data da entrada do CHANGELOG da versao atual e recusa blocos de
resultado de outra versao no corpo do texto.

A escolha por data e versao, em vez de travar a contagem de testes, esta
justificada no arquivo: um teste que afirma o total da suite da qual ele faz
parte muda o proprio alvo a cada teste novo, ficaria vermelho sozinho e
ensinaria a ignorar a falha.

Quando escrito, este teste falhou contra os relatorios da v0.6.7 - que e a prova
de que ele pega o defeito:

```text
AssertionError: E2E_REPORT.md diz 2026-08-15 e o CHANGELOG da v0.6.7 diz
2026-08-16: o relatorio parece ser o da versao anterior com o titulo trocado
```

## B1 - artefatos declarados ausentes do ZIP

O CHANGELOG da v0.6.4 declarava `.claude/skills/gauntlet-loop/SKILL.md`,
`.claude/workflows/gauntlet-loop.js` e `CLAUDE.md` como padrao permanente, e
nenhum estava no pacote.

Resolvido de forma declarada, e nao por silencio:

- `CLAUDE.md` passa a ser incluido no ZIP. Ele descreve o metodo de trabalho e
  os gates, e o auditor externo precisa dele.
- `.claude/` fica fora do pacote por ser configuracao de ferramenta local, e nao
  artefato do produto. Alem disso, o metodo que ele automatizava saiu de uso: o
  dono do projeto proibiu o gauntlet-loop em 27/08/2026, e o `CLAUDE.md` foi
  atualizado para refletir isso. Nenhuma afirmacao deste relatorio se apoia no
  gauntlet - as evidencias desta versao vem de execucao de comando.

## B2 - primeira falha mascarava os demais subgates

Com banco real e chave falsa, o relatorio trazia `database: NOT_EXECUTED` mesmo
com PostgreSQL acessivel, porque o runner abortava na chamada Anthropic do
visitante antes de exercitar o banco.

As duas etapas dependentes da Anthropic passaram a ser adiaveis: a falha e
guardada, as etapas independentes rodam e reportam, e a falha volta a ser fatal
antes de `report.ok = true` e antes da avaliacao strict.

Prova de que o gate nao afrouxou:

- Execucao no mesmo cenario terminou com `ok: false` e exit diferente de zero,
  agora com `database: EXECUTED`, `auth: PASSED`, `sessionSchema`,
  `multiDevice`, `isolation` e `logout` reportados.
- `backend/tests/e2eGate.test.js` ganhou um teste que trava o conjunto exato de
  requisitos de `buildStrictRequirements` e prova que cada requisito, sozinho,
  ainda reprova a execucao.

## Estado dos gates nesta versao

```text
npm run build                      SUCCESS
npm --prefix backend test          104 testes, 98 pass, 0 fail, 6 skip
npm audit --audit-level=high       0 vulnerabilidades
backend audit --audit-level=high   0 vulnerabilidades
secret scan                        0 segredos reais
npm run verify:release             exit 0
npm run verify:e2e                 PASS com PostgreSQL real e Claude real
```

Os 6 testes pulados sao os destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o de integracao real da Anthropic. SKIP
nao conta como PASS em nenhum gate.

## Historico de auditorias anteriores

## Auditoria pelo gauntlet-loop

A v0.6.3 foi submetida ao gauntlet-loop: tres frentes de subagentes auditaram a
migracao e um supervisor adversarial verificou cada alegacao por conta propria.

Resultado: **REPROVADO em 2 rodadas**, notas correctness 8, completeness 5,
evidence 9, craft 8, safety 9. O supervisor encontrou dois defeitos que os 64
testes da v0.6.3 nao pegavam:

```text
A1  ramo de timeout inalcancavel em mapProviderError
    as classes de erro do SDK nao definem `name`; toda instancia herda "Error",
    com status e code indefinidos
    timeout real virava AI_UNAVAILABLE 503 em vez de AI_TIMEOUT 504
    o teste que o cobria usava objetos sinteticos que o SDK nunca produz, entao
    ficava verde defendendo codigo morto

A4  guarda de stop_reason fail-open
    resposta sem stop_reason era aceita como conclusao normal
```

Ambos foram reproduzidos de forma independente antes do conserto, com probe real
do SDK, e corrigidos na v0.6.4. O teste de A1 agora usa instancias reais do SDK.

## Auditoria da v0.6.5 pelo gauntlet-loop e endurecimento na v0.6.6

A v0.6.5 foi submetida ao gauntlet-loop. Resultado: **APROVADO em 2 rodadas**,
notas correctness 9, completeness 9, evidence 9, craft 8, safety 9.

O supervisor confirmou que nao existe bypass completo: um PASS de `verify:e2e`
com API forjada exigiria tambem falsificar todo o fluxo de auth, sessao e
multi-dispositivo contra um PostgreSQL real, o que nao foi demonstrado. Mas
apontou dois problemas legitimos, corrigidos na v0.6.6:

```text
vao estrutural  o gate nao tinha barreira contra E2E_BASE_URL; a perna generica
                de Claude aceitava resposta fabricada por um servidor apontado

mutantes vivos  na superficie de decisao PASS/FAIL, sobreviviam: assert de
                source=anthropic neutralizado, checagem de completude strict
                apagada, perna generica promovida a prova completa, etapa
                e2e:strict removida do gate e env sem E2E_REQUIRE_ANTHROPIC
```

Correcoes da v0.6.6:

```text
E2E_BASE_URL recusado no gate (aceito apenas em e2e:strict direto)
backendProcess === STARTED_BY_RUNNER virou requisito do modo strict
requisitos, validacao de forma, identidade das etapas e loop extraidos
  para scripts/lib/e2eGate.js, testaveis sem subir processo
```

Os seis mutantes citados agora morrem. Um setimo — gravar exit code 0 para uma
etapa que falhou — sobreviveu ao primeiro teste escrito, porque ele conferia so
a quantidade de etapas; morreu depois que o teste passou a conferir o codigo
gravado. Esse caso esta registrado aqui de proposito: teste verde nao e prova de
teste eficaz.

## Hotfix do gate E2E (v0.6.5)

O gate `verify:e2e` dependia de `RUN_OPENAI_INTEGRATION_TESTS` para decidir se
Claude real era exigido. Como ninguem mais define essa flag, o gate podia
concluir sem nunca provar a IA — um PASS que nao valia o que prometia.

Comportamento novo, imposto por codigo:

```text
sem RUN_ANTHROPIC_INTEGRATION_TESTS=true
  -> FAIL BEFORE CALL, exit != 0, nenhuma etapa sobe

com a flag habilitada
  -> gate passa E2E_REQUIRE_ANTHROPIC=true ao runner
  -> doctor:e2e exige PostgreSQL, migrations, ANTHROPIC_API_KEY e ANTHROPIC_MODEL
  -> e2e:strict exige PostgreSQL real e Claude real (maximo 2 chamadas)
  -> PASS somente com todas as etapas em exit 0
```

Cenario explicitamente coberto: PostgreSQL OK + chave configurada + flag
desabilitada resulta em **FAIL**, nunca em PASS sem Claude real.

A logica vive em `scripts/lib/e2eGate.js`, sem I/O, e `backend/tests/e2eGate.test.js`
cobre os quatro casos. A eficacia dos testes foi verificada por mutacao:
reintroduzindo os dois residuos, 4 testes ficam vermelhos.

## Escopo

Correcao do gate E2E acima, sobre a migracao da camada de IA para Anthropic
Claude. Nenhuma funcionalidade de produto foi adicionada e a v0.7.0 continua nao
iniciada.

Preservado sem reescrita: frontend, scanner, Open Food Facts,
`shared/allergenEngine.js`, `shared/productAllergenAdapter.js`, autenticacao,
scrypt, sessoes, schema PostgreSQL, contexto de produto, perfil de alergias,
fallback local, Structured Outputs, testes e arquitetura backend-only de secrets.

## Provider

```text
AI Provider: Anthropic
Default model: claude-sonnet-5
SDK: @anthropic-ai/sdk 0.117.1
API: Messages API (client.messages.create)
```

O modelo e configuravel por `ANTHROPIC_MODEL` e vive em um unico lugar
(`backend/src/config/env.js`). Nenhum arquivo espalha o ID do modelo.

## Arquitetura

```text
React
  -> NutriVa Backend
  -> Anthropic Messages API
```

A chave existe exclusivamente no backend. O frontend nao recebe, nao armazena e
nao conhece o provedor; nao existe nenhuma variavel `VITE_*` de IA.

## Remocao da OpenAI

Toda dependencia ativa foi removida:

```text
backend/package.json          openai removido, @anthropic-ai/sdk adicionado
backend/src/ai/openaiClient.js        removido
backend/src/ai/moderationService.js   removido
```

### Correcao de uma afirmacao falsa da v0.6.3

O relatorio da v0.6.3 declarou "zero ocorrencias ativas" apos a varredura. **Essa
afirmacao estava errada.** O grep usado era sensivel a maiusculas (`openai`,
`OpenAI`, `gpt-`) e nao encontrava a forma `OPENAI` em caixa alta. Dois residuos
executaveis sobreviveram e foram corrigidos apenas na v0.6.5:

```text
scripts/verify-e2e.js   RUN_OPENAI_INTEGRATION_TESTS decidindo a mensagem final
scripts/e2e-real.js     mensagem citando OPENAI_API_KEY no fluxo Anthropic
```

A varredura da v0.6.5 e case-insensitive (`grep -rni openai`) sobre `src/`,
`shared/`, `scripts/`, `backend/src/`, `backend/tests/`, `backend/scripts/` e os
`package.json`. Resultado atual: nenhuma ocorrencia ativa.

Permanecem de proposito, e nao sao residuo:

```text
scripts/verify-release.js   padrao de secret scan para chave OpenAI antiga
backend/tests/*.test.js     assert que reprova provedor citado em codigo de erro
CHANGELOG.md                historico legitimo das versoes anteriores
docs/ARCHITECTURE.md        registro de que a migracao aconteceu na v0.6.3
```

Um teste automatizado agora falha se a flag antiga voltar a qualquer script
executavel, e outro falha se os padroes de secret scan forem removidos.

## Structured Outputs

A resposta e restringida por `output_config.format` com `type: "json_schema"`,
usando o schema ja existente do assistente. O modelo nunca e a unica garantia:

```text
Structured Output
  -> blocos type === "text" concatenados
  -> JSON.parse
  -> validacao Zod (assistantResponseSchema)
  -> resposta da API
```

Falha de estrutura vira `AI_SCHEMA_INVALID`.

## Tratamento de resposta

`stop_reason` e avaliado antes do conteudo:

```text
refusal        -> AI_REFUSAL
max_tokens     -> AI_INCOMPLETE
end_turn       -> parse
stop_sequence  -> parse
outros         -> AI_BAD_RESPONSE
```

Um corpo aparentemente valido nao e aceito quando a geracao terminou de forma
anormal; ha teste cobrindo exatamente esse caso.

Content blocks sao lidos por tipo. O backend concatena apenas blocos
`type === "text"` e nunca assume `content[0]`; um bloco nao textual no inicio da
lista nao quebra a leitura.

## Codigos de erro

A API publica permanece neutra de provedor:

```text
AI_NOT_CONFIGURED  AI_TIMEOUT  AI_RATE_LIMITED  AI_UNAVAILABLE
AI_BAD_RESPONSE    AI_SCHEMA_INVALID  AI_REFUSAL  AI_INCOMPLETE
```

Nenhum codigo `OPENAI_*` ou `ANTHROPIC_*` chega ao frontend. Ha teste que falha
se um codigo citar o provedor.

## Moderacao

A moderacao remota `omni-moderation-latest` foi removida junto com a OpenAI.
Nenhum provedor foi mantido apenas para moderar e nenhuma segunda chamada paga
foi criada em troca.

As protecoes deterministicas locais continuam intactas e independem de IA:

```text
emergencia alergica       preservada
prompt injection          preservada
fora de escopo            preservada
limites de entrada        preservados
validacao Zod             preservada
rate limit do endpoint    preservado
```

## Motor deterministico

`shared/allergenEngine.js` e `shared/productAllergenAdapter.js` nao foram
tocados. O fluxo continua:

```text
Produto -> motor deterministico -> allergySnapshot -> Claude explica
```

Claude nao decide alergia. A matriz de 50+ cenarios e o teste de consistencia
frontend/backend continuam passando sem alteracao.

## Autoridade do perfil

Preservada: conta com `["milk"]` e request com `guestAllergies: ["soy"]` produz
`profileAllergies ["milk"]` e `hasDeclaredConflict true`.

## Privacidade

O payload enviado ao provedor foi inspecionado com mock local, sem custo. Sem
e-mail, senha, hash, salt, cookie de sessao, `DATABASE_URL` ou
`ANTHROPIC_API_KEY`, e com o snapshot deterministico presente.

## Health

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.6.7" }
```

Informa apenas se ha chave, nunca o valor.

## Doctor

Normal e strict passaram a checar `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`;
`OPENAI_*` deixou de ser exigido. A saida mostra `configured` ou
`not_configured`, nunca o valor. O modulo obrigatorio do backend passou de
`openai` para `@anthropic-ai/sdk`.

## PostgreSQL

Sem alteracao de schema. A migracao de IA nao encosta no banco.

POSTGRESQL REAL: NAO EXECUTADO - ambiente sem PostgreSQL, Docker ou
`DATABASE_URL`.

## Claude real

CLAUDE REAL: NAO EXECUTADO.

Motivo: `ANTHROPIC_API_KEY` nao configurada e `RUN_ANTHROPIC_INTEGRATION_TESTS`
desabilitado. Nenhuma chamada paga foi feita e nenhuma chave foi inventada.

O teste real opcional foi migrado para `backend/tests/anthropic.integration.test.js`
e valida `HTTP 200`, `source = anthropic`, `answer` nao vazio, `category` e
`safety` validos.

## Build

```bash
npm run build
```

SUCCESS.

## Tests

```bash
npm --prefix backend test
```

```text
total   79
passed  73
failed  0
skipped 6
```

Testes adicionados nesta versao, todos com mock de `client.messages.create`:

```text
resposta estruturada valida -> source anthropic
stop_reason refusal / max_tokens / pause_turn / tool_use
JSON invalido, schema invalido, conteudo vazio
leitura de content blocks por tipo e fora de ordem
mapeamento 429, 408, ETIMEDOUT, 401, 500, 529 e erro de rede
falha do provedor no fluxo completo virando erro neutro
cliente so existe quando a chave esta configurada
```

Os 6 skips continuam honestos: 5 dependem de PostgreSQL e 1 do Claude real.

## Security

```text
npm audit --audit-level=high                  0 vulnerabilidades
npm --prefix backend audit --audit-level=high 0 vulnerabilidades
secret scan                                   0 segredos reais
```

O secret scan ganhou `sk-ant-` e `ANTHROPIC_API_KEY=` e manteve os padroes
genericos anteriores. Nenhum `.env` real existe no projeto nem entrou no pacote.

## ZIP

```text
releases/nutriva-v0.6.6-auditoria.zip
```

O SHA-256 do pacote e publicado em `releases/SHA256SUMS.txt`, fora do ZIP:
registrar o hash dentro do proprio arquivo invalidaria o hash registrado.

Validado programaticamente: 111 entradas com CRC integro, 0 caminhos com barra invertida,
0 `node_modules`, 0 `dist`, 0 `coverage`, 0 `.git`, 0 `.env` real e 0 segredos.

## Conclusao

A migracao esta completa e o contrato publico do NutriVa nao mudou: o frontend
continua chamando `POST /api/assistant/chat` sem saber qual IA respondeu.

O gate de E2E real segue bloqueado por ambiente, agora por dois requisitos:
PostgreSQL e `ANTHROPIC_API_KEY`.
