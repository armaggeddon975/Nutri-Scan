# Nutri Assistente IA - v0.6.8

## Fluxo

```text
Motor deterministico
  -> Allergy Snapshot
  -> Claude explica
  -> servidor escreve o veredito e aplica o piso de risco
```

A IA nao e a autoridade primaria sobre presenca de alergenicos. O motor
deterministico em `shared/allergenEngine.js` classifica cada ocorrencia de termo
alergico como negada, `contains` ou `traces`. O Claude apenas explica esse
snapshot com linguagem clara.

## Arquitetura

```text
React
  -> POST /api/assistant/chat
  -> Backend NutriVa
  -> contexto controlado + allergySnapshot
  -> Anthropic Messages API
  -> Claude Sonnet 5
```

A chave Anthropic fica somente no backend. O frontend nunca recebe nem armazena
essa chave.

## Contexto Enviado

Produto:

- codigo de barras
- nome
- marca
- ingredientes
- `ingredients_text_pt`, `ingredients_text`, `ingredients_text_en`
- `allergens`, `allergens_tags`
- `traces`, `traces_tags`
- `labels`, `labels_tags`
- nutrimentos selecionados
- nutriscore
- quantidade
- porcao

O contexto preserva a semantica dos campos:

```text
ingredients -> analise contextual
allergens -> presenca declarada
traces -> possivel traco
```

A IA recebe um snapshot ja calculado por essa regra. Ela nao decide se um texto
em `traces` e presenca ou traco.

Perfil:

- apenas IDs de alergias necessarios para a analise

Nao sao enviados e-mail, senha, cookie, token, hash, sessoes ou dados internos
desnecessarios.

## Allergy Snapshot

Exemplo:

```json
{
  "profileAllergies": ["milk"],
  "detectedConflicts": ["milk"],
  "possibleTraces": [],
  "hasDeclaredConflict": true,
  "hasTraceConflict": false,
  "hasProductContext": true
}
```

Mapeamento:

- `severity: "contains"` vira `detectedConflicts`.
- `severity: "traces"` vira `possibleTraces`.

Tracos nao sao tratados como presenca declarada. Se houver evidencia de
`contains` e `traces` para o mesmo alergeno, `contains` vence.

## Provedor de IA

```text
AI Provider: Anthropic
Default model: claude-sonnet-5
```

O modelo e configuravel por `ANTHROPIC_MODEL` e existe em um unico lugar:
`backend/src/config/env.js`. Nenhum arquivo espalha o ID do modelo.

## Messages API

O backend usa o SDK oficial `@anthropic-ai/sdk` e chama `client.messages.create`
com:

- `model: env.anthropicModel`
- `max_tokens: env.anthropicMaxOutputTokens`
- `system: ASSISTANT_SYSTEM_PROMPT`
- `messages`: conversa recente e dados nao confiaveis
- `output_config.format` com `type: "json_schema"` (Structured Outputs)
- `thinking: { type: "disabled" }`
- timeout por `ANTHROPIC_TIMEOUT_MS`, no cliente e na chamada

As instrucoes privilegiadas ficam no parametro `system`. A Messages API nao
aceita uma mensagem `role: "system"` dentro de `messages`, e o NutriVa nunca
tenta usar uma.

O assistente responde curto e estruturado, entao o thinking fica desligado: sem
ele, todo o orcamento de `max_tokens` sobra para a resposta util e nao ha risco
de truncar o JSON. Se `ANTHROPIC_MODEL` apontar para um modelo que exige
thinking sempre ligado, remova esse parametro antes de trocar o modelo.

Structured Outputs restringe o formato, mas nao substitui validacao:

```text
Claude Structured Output
  -> extracao dos blocos type === "text"
  -> JSON.parse
  -> validacao Zod (assistantResponseSchema)
  -> resposta da API
```

Se a estrutura nao passar no Zod, o backend responde `AI_SCHEMA_INVALID`.

## Edge Cases

O `stop_reason` e avaliado antes do conteudo. Uma resposta so e aceita quando
termina normalmente:

```text
refusal     -> AI_REFUSAL
max_tokens  -> AI_INCOMPLETE
end_turn    -> segue para o parse
stop_sequence -> segue para o parse
qualquer outro -> AI_BAD_RESPONSE
```

Assim, um corpo aparentemente valido nao e aceito quando a geracao terminou de
forma anormal.

Os blocos de conteudo tambem sao lidos por tipo, nunca por posicao. O backend
concatena apenas os blocos `type === "text"`; um bloco nao textual no inicio da
lista nao quebra a leitura, e `content[0]` nunca e assumido.

Codigos de erro da API publica sao neutros de provedor:

- `AI_NOT_CONFIGURED`: sem chave configurada, ou credencial rejeitada.
- `AI_REFUSAL`: recusa explicita do modelo.
- `AI_INCOMPLETE`: resposta truncada por limite de tokens.
- `AI_SCHEMA_INVALID`: JSON valido, mas fora do schema esperado.
- `AI_BAD_RESPONSE`: resposta inesperada ou JSON quebrado.
- `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_UNAVAILABLE`: falhas de transporte.

Nenhum codigo cita o provedor. O frontend nao precisa saber qual IA respondeu.

Em `AI_REFUSAL`, o app prefere resposta segura de indisponibilidade ou limite de
escopo, sem usar fallback para contornar protecao do modelo.

## Prompt Injection

Produto, ingredientes, marca, rotulo, conversa e mensagem do usuario sao dados
nao confiaveis. Dados variaveis entram na mensagem de usuario em JSON. As
instrucoes privilegiadas ficam fixas no parametro `system`.

Teste automatizado confirma que instrucao maliciosa em ingrediente nao entra nas
instrucoes privilegiadas e nao muda o snapshot deterministico.

## Moderacao

A v0.6.3 removeu a moderacao remota que existia na integracao anterior. Manter
um segundo provedor apenas para moderar seria dependencia e custo sem retorno.

As protecoes deterministicas locais continuam, e elas funcionam com ou sem IA:

```text
deteccao de emergencia alergica
heuristica de prompt injection
heuristica de fora de escopo
limites de tamanho de mensagem e conversa
validacao Zod da entrada
rate limit do endpoint
```

Nenhuma dessas protecoes depende de chamada externa.

## Fallback

Quando a IA nao esta configurada, fica indisponivel, atinge timeout, rate limit
ou retorna erro controlado, o frontend pode usar `buildAssistantAnswer()` como
fallback local. O fallback nao substitui o motor deterministico de alergias.

Na v0.6.0, o E2E real valida o endpoint `POST /api/assistant/chat` contra uma
API real. Chamadas pagas da Anthropic continuam bloqueadas por padrao e so rodam
com `RUN_ANTHROPIC_INTEGRATION_TESTS=true` e chave configurada no backend.

Na v0.6.1, a decisao de fallback deixou de viver apenas no componente React e
passou a ser uma funcao pura em `src/services/assistantFallback.js`:

```text
AI_REFUSAL          -> texto fixo de recusa, source local
demais erros da IA  -> buildAssistantAnswer(), source local
```

`AI_NOT_CONFIGURED` cai na segunda linha e tem teste automatizado. A UX atual
foi preservada; apenas a decisao ficou testavel fora do React.

## Autoridade do perfil

Para usuario autenticado, o perfil oficial vem sempre do PostgreSQL. O campo
`guestAllergies` do request so vale para visitante.

```text
conta com ["milk"] + request com guestAllergies ["soy"]
-> allergySnapshot.profileAllergies = ["milk"]
```

O E2E da v0.6.1 prova isso de duas formas: por teste automatizado com loader
injetado e, quando ha PostgreSQL real, por instrumentacao interna que le o
payload enviado a um mock da Anthropic. A API publica continua sem expor o
snapshot.

## Veredito deterministico e piso de risco

Ate a v0.6.7, a autoridade do motor existia apenas como frase no system prompt.
Uma auditoria externa mostrou o que isso valia: com um cliente que devolvia
`safety: "normal"` e o texto "este produto NAO contem leite e e totalmente
seguro", para um perfil com alergia a leite e um produto com leite declarado, a
resposta chegava ao usuario exatamente assim. Instrucao ao modelo nao e
garantia.

Desde a v0.6.8 o veredito e um campo autoral do servidor, em
`shared/allergyVerdict.js`:

```text
allergySnapshot (motor)
  -> buildAllergyVerdict()
  -> applyAllergyAuthority(resposta do modelo, veredito)
  -> resposta ao usuario
```

Tres garantias impostas por codigo:

```text
1. o campo `allergyVerdict` e escrito pelo servidor, nunca pelo modelo
2. com conflito declarado, `safety` nunca sai como "normal"
3. o alerta em texto e escrito pelo servidor, separado de `answer`
```

O modelo nao escreve o campo por duas barreiras independentes. O
`assistantResponseSchema` e `.strict()`: qualquer chave fora do contrato faz a
resposta inteira ser rejeitada com `AI_SCHEMA_INVALID`, em vez de a chave ser
descartada em silencio. E `applyAllergyAuthority` remove qualquer
`allergyVerdict` da resposta antes de escrever o do motor, de modo que o valor
entregue vem do motor mesmo que algo chegue ali por outro caminho.

O piso de risco so sobe, nunca desce: uma resposta `urgent` continua `urgent`.
Traco declarado aparece no veredito com `status: "traces"` e alerta proprio, mas
nao muda o nivel de risco do modelo - `traces` significa "pode conter", e
confundir isso com evidencia declarada tiraria o sentido do piso.

Quando o modelo responde `safety: "normal"` havendo conflito declarado, isso e
registrado como tentativa de minimizacao:

```json
{
  "event": "assistant.allergy_minimization_attempt",
  "conflicts": ["milk"],
  "modelSafety": "normal",
  "enforcedSafety": "caution",
  "total": 1
}
```

O registro nao carrega mensagem, identificador de usuario, e-mail nem chave. Ele
nao derruba a requisicao: a resposta ja foi corrigida pelo piso, e o objetivo e
o operador enxergar a frequencia.

Todas as respostas do endpoint passam pelo mesmo ponto de saida, inclusive as
locais de urgencia, fora de escopo e tentativa de injecao. A invariante fica
auditavel em uma frase: nenhuma resposta com conflito declarado sai com safety
"normal", venha ela da IA ou nao.

Na interface, o bloco deterministico aparece acima do texto do modelo, e o
estado exibido vem sempre de `verdict.status`. A UI nunca infere conflito do
texto da resposta.

## Limites Medicos

O Nutri Assistente e informativo. Ele pode explicar rotulos, ingredientes,
nutrientes, alergenicos e conceitos alimentares.

Ele nao deve diagnosticar, prescrever medicamento, prescrever tratamento,
substituir medico ou garantir seguranca absoluta quando os dados nao permitem.
Em sinais de reacao alergica grave, deve orientar atendimento imediato.

## Limite milk/lactose

O ID legado `milk` continua agrupando `Leite/lactose`. `Sem lactose` nao quer
dizer automaticamente `sem proteinas do leite`. Se o produto informa `whey`,
`caseina`, `proteina do leite` ou `leite integral`, o snapshot deve manter
`milk` como conflito declarado.
