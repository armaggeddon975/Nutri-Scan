# Arquitetura NutriScan v0.7.6

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

## Limite de requisicoes

Tres limitadores, com finalidades diferentes:

```text
auth          40 / 15 min   por IP      protege senha contra forca bruta
assistente    20 / 10 min   por IP      cada chamada custa dinheiro
colecoes     300 / 10 min   por USUARIO controle primario de escrita
colecoes    3000 / 10 min   por IP      contencao de abuso multiconta
```

As rotas de colecoes - `/api/history` e `/api/favorites` - passam pelos DOIS
ultimos. Passar exige caber nos dois; qualquer um recusando termina em 429.

### Por que dois, e nao um

O desenho e resultado de dois defeitos encontrados por auditoria externa, um
depois do outro.

**D1 (v0.7.0).** O limitador de colecoes contava so por IP. A suite de
integracao roda todos os testes de `127.0.0.1`, na mesma janela, e o contador
sobrevive aos servidores que cada teste sobe e derruba: **372 requisicoes**
medidas. Contra um teto de 300, ela estourava no oitavo teste, e nove testes
falhavam ao tentar ler `Too many requests` como JSON - entre eles I1, I2 e I3,
os de isolamento entre contas.

**E1 (v0.7.1).** A correcao trocou a chave para o usuario da sessao. Como
`requireAuth` roda antes do limitador, toda requisicao que chega ali ja tem
sessao, e o ramo de IP nunca executava: o teto por usuario **substituiu** o teto
por IP em vez de somar. Quatro contas do mesmo endereco passavam 1200
requisicoes.

Os dois tetos resolvem coisas distintas e por isso precisam coexistir:

```text
por usuario   impede que uma conta sozinha encha a propria tabela
              e protege o vizinho de NAT, que antes era punido junto

por IP        impede que um endereco contorne o teto por usuario
              simplesmente criando contas
```

### A ordem: usuario primeiro

O teto por usuario e conferido antes do de IP. Com a ordem invertida, a
requisicao 301 de um usuario abusivo passaria pelo contador de IP -
incrementando-o - para so entao ser recusada pelo contador de usuario. O abusivo
gastaria orcamento compartilhado com requisicoes que nem foram atendidas,
punindo os vizinhos de NAT.

### De onde vem o teto de 3000 por IP

Medido, nao estimado:

```text
suite de integracao de colecoes   372 requisicoes de um unico IP
scripts/e2e-real.js                 9 requisicoes
```

A restricao que manda nao e o teste - e o caso NAT/CGNAT. Uso intenso gira em
torno de 60 requisicoes de colecoes por 10 minutos por pessoa; 3000 acomoda
cerca de 50 pessoas nesse ritmo atras do mesmo endereco, ou 10 pessoas gastando
a cota individual inteira. Um teto perto de 300 puniria exatamente quem o teto
por usuario existe para proteger.

A folga sobre a maior medicao e de 8,06x. O teste `R11`, em
`backend/tests/collectionsIntegration.test.js`, confere essa folga a cada
execucao e reprova com mensagem explicativa se um teste novo empurrar a conta
para perto do limite - para que D1 nao volte por descuido.

### `trust proxy` e a identidade do balde de IP

Em producao `app.set("trust proxy", 1)` esta ligado, porque o Render coloca um
proxy na frente. Com esse ajuste, `req.ip` e sempre o **ultimo** valor de
`X-Forwarded-For`, que e o que o proxy acrescenta. Um cliente que prefixa
valores proprios nao muda `req.ip`, entao nao escolhe o proprio balde.

Isso tambem e o que impede o teto por IP de virar um teto global: sem
`trust proxy`, todos os clientes apareceriam com o endereco do proxy e
dividiriam um balde so.

A chave de IP normaliza IPv6 para o prefixo `/64`. Quem recebe um `/64` da
operadora tem 2^64 enderecos; sem normalizar, trocar de endereco a cada
requisicao daria um balde novo toda vez.

### Nenhum bypass

Nenhuma variavel de ambiente, cabecalho, query string ou cookie desliga qualquer
um dos limitadores. Um interruptor desses e uma porta, e uma porta que possa ser
aberta em producao troca um defeito de teste por uma vulnerabilidade.

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

## Deploy

O app esta publicado no Render, em `https://nutriscan-h1wp.onrender.com`, com
banco no Neon. Um unico servico serve frontend e API **na mesma origem**:

```text
https://nutriscan-h1wp.onrender.com/        frontend compilado
https://nutriscan-h1wp.onrender.com/api/*   API
```

Ate a v0.7.4 esta secao dizia "Nenhum deploy foi feito nesta etapa". Isso ja
nao era verdade: o servico estava no ar, anunciando uma versao anterior.

As tres decisoes de producao estao em [DEPLOY.md](DEPLOY.md), com o motivo de
cada uma:

```text
HTTPS        redirecionamento no proxy do Render; HSTS mandado pelo backend
cookie       HttpOnly, Secure em producao, SameSite=Lax - funciona porque a
             origem e a mesma; separar frontend e API em dois servicos do
             Render quebraria isso (onrender.com esta na Public Suffix List)
migrations   no build, nao no start: migration que falha impede a publicacao
```

### Boot em producao

Com `NODE_ENV=production`, `backend/src/server.js` confere
`DATABASE_URL`, `DATABASE_SSL`, `FRONTEND_ORIGIN` e `TRUST_PROXY` antes de abrir
a porta. Faltando qualquer uma, ou com booleano nao reconhecido, o processo sai
com codigo 1 e diz qual variavel falta, sem imprimir valor.

A regra comum as quatro: a falta seria silenciosa. O app subiria, pareceria
funcionar, e o defeito so apareceria depois - CORS confiando em localhost,
conexao sem TLS, ou o teto por IP virando teto global.

### Versao

A versao tem uma fonte so: `backend/package.json`. `env.js` le de la, e o
`/api/health` devolve esse valor. O `verify:deploy` compara o que o deploy
anuncia com o `package.json` da raiz, por igualdade estrita.
