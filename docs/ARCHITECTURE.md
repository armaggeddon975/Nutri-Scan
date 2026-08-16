# Arquitetura NutriScan v0.6.6

## Visao geral

NutriScan tem tres areas principais:

- Frontend React/Vite em `src/`.
- Backend Express/PostgreSQL em `backend/`.
- Motor compartilhado em `shared/`.

Fluxo geral:

```text
React
  -> /api
  -> Express
  -> PostgreSQL
```

## Motor deterministico de alergias

```text
Produto
  -> Motor deterministico compartilhado
     -> UI
     -> Backend AI Context
          -> Anthropic Claude
```

`shared/allergens.js` contem a lista canonica de alergias. `shared/text.js`
centraliza normalizacao e regex de termos. `shared/allergenEngine.js` classifica
alergenicos com as mesmas regras para frontend e backend.

Na v0.5.2, o motor deixou de apagar segmentos globais para lidar com negacoes ou
tracos. Ele encontra cada ocorrencia de termo alergico e classifica aquela
evidencia pelo contexto local como negada, `contains` ou `traces`. Depois agrega
o resultado com precedencia:

```text
contains > traces > none
```

Na v0.5.3, o adapter separa a origem semantica dos campos:

```text
ingredients / ingredients_text -> parser contextual
allergens -> contains declarado
traces -> traces declarado
```

Assim, `traces: "milk"` nao entra no parser como texto comum; ele e avaliado
como possivel traco pela origem do campo. `allergens: "milk"` e avaliado como
presenca declarada.

O motor preserva:

- negacoes como `sem lactose` e `nao contem leite`, sem esconder evidencias
  positivas posteriores;
- exclusoes como `leite de coco`, `bebida vegetal` e `manteiga de cacau`;
- escopo local de `pode conter`, sem transformar sentencas seguintes em tracos;
- tags de alergenicos, tags de tracos e labels negativas;
- termos normalizados e regex compartilhadas.

## Limite milk/lactose

O ID `milk` continua representando `Leite/lactose` por compatibilidade com
localStorage e PostgreSQL. O motor trata `sem lactose` como negacao da evidencia
`lactose`, mas isso nao anula evidencias como `leite integral`, `whey`,
`caseina` ou `proteina do leite`.

## Frontend

`src/utils/allergens.js` chama o motor de `shared/allergenEngine.js`. A UI nao
mantem regras paralelas de alergia.

`src/services/aiAssistantService.js` envia ao backend apenas contexto controlado
do produto, incluindo ingredientes, tags de alergenicos, tags de tracos e labels.

## Backend

`backend/src/config/allergies.js` reexporta a fonte canonica de `shared/`.

`backend/src/ai/contextBuilder.js` monta o produto controlado e gera
`allergySnapshot` usando o mesmo motor compartilhado. O backend nao possui mais
um segundo motor simplificado baseado em `hasTagMatch()` ou `hasTermMatch()`.

## Nutri Assistente IA

```text
React
  -> /api/assistant/chat
  -> Backend NutriScan
  -> allergySnapshot deterministico
  -> Anthropic Messages API
  -> Claude Sonnet 5
```

Na v0.6.3 a camada de IA migrou de OpenAI para Anthropic. O contrato publico do
NutriScan nao mudou: o frontend continua chamando `POST /api/assistant/chat` e
nao sabe qual provedor respondeu. Trocar de provedor de novo no futuro exige
mexer apenas em `backend/src/ai/`.

Se houver sessao valida, o backend usa alergias oficiais do PostgreSQL. Como
visitante, usa `guestAllergies` validado.

A chave Anthropic fica exclusivamente no backend. Health informa apenas se a IA
esta configurada, sem chamar o provedor de IA.

## Ambiente

O backend carrega `backend/.env` usando caminho absoluto calculado a partir de
`backend/src/config/env.js`. Variaveis do sistema operacional e da hospedagem
tem prioridade sobre o `.env` local.

Na v0.6.0, `npm run doctor` verifica ambiente, dependencias, PostgreSQL,
migrations, IA, portas e Docker sem imprimir secrets. `npm run e2e:real`
executa validacoes contra uma API real rodando e usa cookies independentes para
simular dispositivos diferentes.

## Infraestrutura de validacao na v0.6.1

O Doctor foi separado em duas camadas para poder rodar antes das dependencias:

```text
scripts/lib/     apenas built-ins do Node.js (logica pura + probes)
scripts/doctor.js  built-ins primeiro; pg, dotenv e env do backend sob demanda
```

`scripts/lib/doctorChecks.js` concentra a logica pura de dependencias,
migrations e requisitos strict. `scripts/lib/envProbe.js` le `.env` sem dotenv.
`scripts/lib/moduleProbe.js` resolve modulos a partir do `package.json` correto.
`scripts/lib/sessionSchema.js` avalia colunas de `sessions`.
`scripts/lib/backendProcess.js` cuida do backend temporario do runner E2E.

Dois niveis de validacao:

```text
verify:release -> doctor normal + build + testes + audits + secret scan
verify:e2e     -> doctor:e2e + e2e:strict (PostgreSQL real obrigatorio)
```

O runner E2E decide sozinho como alcancar a API:

```text
E2E_BASE_URL definido  -> usa o servidor informado, nao inicia processo
E2E_BASE_URL ausente   -> spawn backend -> aguarda /health -> testa -> encerra
```

O backend temporario e encerrado em sucesso, falha, excecao e SIGINT. A espera
do `/health` tem timeout (`E2E_STARTUP_TIMEOUT_MS`, padrao 30s) e falha com
mensagem clara quando a API nao sobe.

A inspecao de sessao consulta `information_schema.columns` para confirmar
`token_hash` e a ausencia de colunas de token bruto. Nenhum valor de token e
lido ou impresso.

## Autenticacao

```text
Browser
  -> HttpOnly session cookie
  -> Backend
  -> SHA-256(token)
  -> PostgreSQL.sessions
```

O middleware aceita cookie e `Authorization: Bearer` para uso futuro. A web
atual nao grava token em `localStorage`.

## Logout e sessoes

Logout e idempotente e tenta limpar o cookie mesmo quando a sessao esta ausente,
expirada ou desconhecida. Quando uma rota autenticada retorna
`401 UNAUTHENTICATED`, o frontend volta ao modo visitante.

## Alergias por perfil

Visitante:

```text
localStorage -> nutriscan:guest-allergies
```

Usuario autenticado:

```text
PUT /api/profile/allergies -> PostgreSQL.user_allergies
```

O frontend usa fila sequencial para salvar alergias e impedir que uma resposta
antiga sobrescreva a intencao mais nova.

## Deploy futuro

Para producao, a arquitetura web deve preferir frontend e API sob a mesma origem
logica, por exemplo:

```text
https://nutriscan.com
https://nutriscan.com/api
```

Nenhum deploy foi feito nesta etapa.
