# Arquitetura NutriScan v0.13.0

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

Quatro limitadores, com finalidades diferentes:

```text
auth          40 / 15 min   por IP      protege senha contra forca bruta
assistente    20 / 10 min   por IP      cada chamada custa dinheiro
colecoes     300 / 10 min   por USUARIO controle primario de escrita
colecoes    3000 / 10 min   por IP      contencao de abuso multiconta
exportacao     5 / 24 h     por USUARIO uso legitimo e raro (v0.8.0)
exportacao    20 / 24 h     por IP      contencao de abuso multiconta
comparacao    30 / 10 min   por USUARIO uso na gondola, com folga (v0.10.0)
comparacao   300 / 10 min   por IP      contencao de abuso multiconta
```

A comparacao tambem usa a mesma fabrica, com baldes proprios. A explicacao da
comparacao (`POST /api/compare/explain`) passa ainda pelo balde do assistente:
o teto de chamadas de IA e um so para o chat e para ela. A busca de produto roda
no navegador, direto na Open Food Facts, e nenhum limitador do backend a cobre.

A exportacao usa a mesma fabrica das colecoes, com baldes proprios. A exclusao
de conta (`DELETE /api/account`) confere senha e por isso passa pelo de auth.
O raciocinio dos numeros da exportacao esta em `rateLimit.js` e em
`docs/DADOS_DO_TITULAR.md`.

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

## Dados do titular (v0.8.0)

```text
GET    /api/account/export -> requireAuth -> limitador de exportacao -> 4 leituras por user_id
DELETE /api/account        -> limitador de auth -> requireAuth -> senha -> transacao
```

A identidade vem so de `req.user`. A exclusao apaga as sessoes e a linha de
`users` na mesma transacao; alergias, historico e favoritos saem pela cascata das
FKs (`ON DELETE CASCADE` nas quatro tabelas que referenciam `users`). Exclusao
fisica, sem `deleted_at`. Decisoes em `docs/DADOS_DO_TITULAR.md`.

## Nivel de alerta por alergia (v0.9.0)

```text
user_allergies.alert_level   standard | strict   (CHECK no banco, default standard)
PUT /api/profile/allergies   { allergies, alertLevels? }
buildAllergyVerdict          alertLevels -> resposta a classificacao
```

O nivel muda a RESPOSTA do motor a classificacao, nunca a classificacao:
`analyzeProductAllergens` continua decidindo declarado e traco. Em
`shared/allergyVerdict.js`, alergia `strict` faz o traco virar conflito (piso
`caution`) e o conflito declarado subir o piso para `urgent`. Alergia
`standard` produz o veredito da v0.8.0, byte a byte.

O nivel e lido do PostgreSQL junto com as alergias e passado ao veredito, que e
montado antes da chamada de IA. Ele nao entra no `allergySnapshot` enviado ao
modelo. O frontend usa o mesmo motor, com o nivel do perfil, no veredito local e
nas etiquetas da tela do produto. Decisoes em `docs/NIVEL_DE_ALERTA.md`.

## Comparacao de dois produtos (v0.10.0)

```text
src/services/productLookup.js   consultarDoisProdutos: prepararCodigo x2, iguais?, busca x2
shared/productComparison.js     compareProducts: um veredito por produto + diferencas
POST /api/compare               perfil da sessao, motor x2, piso produto a produto
POST /api/compare/explain       o mesmo + uma chamada ao modelo, amarrada por codigo
```

As duas buscas acontecem no navegador, pelo caminho de um produto chamado duas
vezes - mesma conferencia de digito, mesma canonicalizacao, mesmo
`openFoodFactsService`. O backend recebe o par ja encontrado, como dado nao
confiavel, confere os codigos de novo e reduz cada produto ao contexto
controlado do assistente.

`compareProducts` chama `analyzeComparedProduct` uma vez para cada produto, e
cada chamada monta o veredito com `buildAllergyVerdict`. Nao existe veredito da
comparacao. O piso de risco e imposto produto a produto: sem modelo, por
`applyAllergyAuthority`; com modelo, por `finalizeAssistantResponse`, o mesmo do
chat, chamado uma vez por produto com o veredito DAQUELE produto.

O modelo devolve uma explicacao por `productCode`. `amarrarExplicacoes` exige
cada codigo da comparacao exatamente uma vez e nenhum outro; o servidor poe cada
explicacao no produto pelo codigo, nunca pela posicao.

Produto sem texto de ingredientes, alergenicos ou tracos sai com `allergenData:
"not_informed"` e veredito `not_evaluated` / `no_allergen_data`; nutriente
ausente sai `null`. Nada e gravado. Decisoes em `docs/COMPARACAO.md`.

## Leitura sem rede (v0.11.0)

```text
src/services/offlineCache.js     IndexedDB "nutriscan-offline": produtos, perfis,
                                 colecoes, sessao - lista fechada de campos, por dono
src/services/offlineLookup.js    consultarNoAparelho (prepararCodigo antes do cache),
                                 avaliarNoAparelho (motor de shared/ + piso)
src/services/offlineSession.js   recuperarSessao, sair, excluir, 401 - e a porta
                                 unica de escrita: escreverComInternet
```

O cache e de LEITURA. Ele guarda o produto que a pessoa abriu com internet e o
perfil que o servidor confirmou; nunca o veredito. Sem rede, o veredito e refeito
em `avaliarNoAparelho`, com `analyzeProductAllergens`, `buildAllergyVerdict` e
`applyAllergyAuthority` - os mesmos de sempre - e o perfil do momento.

Cada registro tem dono (a conta ou o visitante), e o aparelho guarda uma conta
por vez: confirmar uma conta apaga a de qualquer outra; sair, excluir ou ter a
sessao recusada (401) apaga a da conta. Com rede, a rede manda: o app so le o
aparelho quando o navegador esta offline, quando a internet falha ou depois de 6
s sem resposta, sempre marcando a origem. Decisoes em `docs/OFFLINE.md`.

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

Antes dessas quatro, o servidor confere o proprio `NODE_ENV`. Um valor
desconhecido - `producao`, `prod`, `staging` - recusa subir. Sem essa
conferencia, um erro de digitacao viraria `development` e desligaria em silencio
justamente a checagem acima, junto com o cookie `Secure`. Ausente continua sendo
desenvolvimento.

### Leitura da camera

O que a camera le nunca vira OUTRO codigo (`codigoLidoPelaCamera`, em
`src/utils/text.js`). So digitos, com espaco ou hifen, seguem como antes. Letras
e digitos passam intactos e, na Open Food Facts, viram "nao encontrado". Qualquer
outro caractere descarta a leitura, e nada e cortado.

Ate a v0.7.6 a leitura passava por `cleanBarcode`, que apaga tudo que nao e
digito: um CODE_128 com letras virava o EAN de outro produto, com outros
alergenicos. Uma leitura curta com letras caia ainda na busca por NOME. Agora
uma leitura de camera sempre segue para a consulta por codigo.

### Versao

A versao tem uma fonte so: `backend/package.json`. `env.js` le de la, e o
`/api/health` devolve esse valor. O `verify:deploy` compara o que o deploy
anuncia com o `package.json` da raiz, por igualdade estrita.
