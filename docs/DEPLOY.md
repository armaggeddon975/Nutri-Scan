# Deploy do NutriScan - v0.7.5

Como o NutriScan e publicado, o que precisa estar configurado, e como provar que
o que esta no ar e o que foi auditado.

## Arquitetura de publicacao

```text
Render (web service "nutriscan", plano free)
  -> proxy do Render: termina TLS, redireciona http -> https
  -> Node: backend/src/server.js
       -> /api/*        API Express
       -> o resto       frontend compilado (dist/), mesma origem
  -> Neon: PostgreSQL
```

Um unico servico serve a API e o frontend, **na mesma origem**. Essa escolha
sustenta as decisoes de cookie e CORS abaixo.

## Variaveis de ambiente

Levantamento completo das variaveis que o backend le (todas em
`backend/src/config/env.js`).

```text
variavel                     em producao   default             se faltar em producao
---------------------------  ------------  ------------------  -----------------------------------
NODE_ENV                     define modo   development         roda como desenvolvimento (ver nota)
DATABASE_URL                 OBRIGATORIA   (nenhum)            NAO SOBE
DATABASE_SSL                 OBRIGATORIA   false (so em dev)   NAO SOBE
FRONTEND_ORIGIN              OBRIGATORIA   localhost (so dev)  NAO SOBE
TRUST_PROXY                  OBRIGATORIA   true em prod        NAO SOBE
PORT                         opcional      3000                ouve na 3000; o Render sempre injeta
SESSION_TTL_DAYS             opcional      30                  30 dias
SESSION_COOKIE_NAME          opcional      nutriscan_session   nome padrao
ANTHROPIC_API_KEY            opcional      (vazia)             assistente local; health ai=not_configured
ANTHROPIC_MODEL              opcional      claude-sonnet-5     modelo padrao
ANTHROPIC_TIMEOUT_MS         opcional      20000               20 s
ANTHROPIC_MAX_OUTPUT_TOKENS  opcional      1200                1200
```

**Obrigatoria ausente, ou booleano nao reconhecido, impede o processo de
subir.** A mensagem diz qual variavel e por que - nunca o valor de nenhuma:

```text
NutriScan NAO subiu: configuracao de producao incompleta.
  - FRONTEND_ORIGIN: ausente ou vazia
Defina as variaveis no painel da hospedagem. Nenhum valor e impresso aqui.
```

`FRONTEND_ORIGIN` em producao precisa ser `https://` e so a origem - esquema e
host, sem caminho, sem barra no fim. No servico atual:

```text
FRONTEND_ORIGIN=https://nutriscan-h1wp.onrender.com
```

**`SESSION_SECRET` nao existe neste projeto.** A sessao e um token aleatorio de
alta entropia, guardado no banco so como hash SHA-256. Nao ha assinatura de
cookie, entao nao ha segredo de assinatura para configurar.

### Por que essas quatro sao obrigatorias

`ANTHROPIC_API_KEY` e opcional por decisao de produto: sem ela o assistente cai
na resposta local, e o health diz `ai: not_configured`. A falta e visivel.

As quatro obrigatorias tem em comum o fato de que a falta seria **silenciosa**:

```text
DATABASE_URL     o app sobe, mas conta, perfil, historico e favoritos dao 503
DATABASE_SSL     um default false manda a conexao - e a senha - sem TLS se o
                 banco aceitar
FRONTEND_ORIGIN  o default era localhost: o backend anunciava em CORS, com
                 credenciais, que confiava numa origem local
TRUST_PROXY      errado para um lado, todos compartilham o IP do proxy e o teto
                 de 3000 por IP vira teto global; errado para o outro, o cliente
                 escolhe o proprio IP pelo X-Forwarded-For e foge do teto
```

### Nota sobre NODE_ENV - nao corrigido, para decisao

Um `NODE_ENV` com erro de digitacao (`prod`, `producao`) e tratado como
`development`. Em producao isso desligaria em silencio o cookie `Secure`, as
verificacoes de boot e a omissao de detalhe nos erros.

Nao foi alterado nesta versao porque um teste existente
(`valores invalidos de ambiente caem em defaults seguros`) trava esse
comportamento de proposito. A correcao natural seria recusar subir com
`NODE_ENV` nao reconhecido. Fica descrita para decisao.

## Decisao: HTTPS e delegado ao Render, HSTS e do backend

```text
redirecionamento http -> https   no proxy do Render, nao no backend
Strict-Transport-Security        no backend (helmet), max-age de 1 ano
upgrade-insecure-requests        na CSP, so em producao
```

**Por que o backend NAO redireciona.** O Render termina TLS no proxy e
redireciona http para https na borda, para todo servico `onrender.com`. Um
redirecionamento no proprio backend, baseado em `req.secure`, teria dois riscos:
o health check do Render bate na porta interna, e um redirect o derrubaria; e com
`trust proxy` errado, `req.secure` mente e o redirect pode entrar em laco. O
teste `6.5` exige que `/api/health` responda 200 sem redirecionar.

**Por que o backend manda HSTS assim mesmo.** E defesa em profundidade: depois
do primeiro acesso, o navegador passa a recusar http por conta propria, e a
garantia nao depende mais de a borda redirecionar. Se o servico um dia for
servido por outra plataforma, o HSTS continua.

O `verify:deploy` prova as duas metades contra o deploy: D2 exige que http
redirecione para https, e D3 exige HSTS com `max-age` de pelo menos 180 dias.

## Decisao: cookie de sessao com SameSite=Lax

```text
httpOnly   true   o JavaScript da pagina nao le a sessao
secure     true   so trafega por https (em producao)
sameSite   lax
path       /
maxAge     SESSION_TTL_DAYS - o mesmo valor que define a expiracao no banco
```

**Por que `lax`.** Frontend e API estao na mesma origem, entao toda chamada do
app e de mesmo site e o cookie vai junto. `lax` recusa o cookie em subrequisicao
de outro site - um `fetch` ou formulario disparado de uma pagina de terceiro -,
que e a forma classica de CSRF, e continua mandando na navegacao normal.

`none` so seria necessario se frontend e API ficassem em **sites diferentes**, e
traria de volta a exposicao a CSRF. A arquitetura evita isso de proposito.

**Atencao se a arquitetura mudar.** `onrender.com` esta na Public Suffix List:
`frontend.onrender.com` e `api.onrender.com` sao SITES DIFERENTES, nao
subdominios do mesmo site. Separar frontend e API em dois servicos do Render
quebraria o login com `lax`, e a saida facil - `none` - abriria CSRF. Se um dia
separar, use dominio proprio para os dois.

`maxAge` e a expiracao no banco vem do mesmo `SESSION_TTL_DAYS`, por
construcao. O teste `P1` mede os dois num processo em producao e exige que
batam.

## Decisao: migrations rodam no BUILD, nao no start

```text
buildCommand  npm ci --include=dev && npm --prefix backend ci
              && npm run build && npm run db:migrate
startCommand  npm start            -> node backend/src/server.js
```

**O `start` NAO aplica migrations.** Quem aplica e o `buildCommand` do Render,
com a `DATABASE_URL` de producao, antes de a versao nova comecar a servir.

Por que isso e bom:

```text
migration falha   o build falha, e o Render mantem a versao anterior no ar
migration passa   a versao nova so sobe com o schema que ela espera
idempotencia      cada migration fica registrada em schema_migrations e e
                  pulada nas seguintes (`.sql` e `.js`, desde a v0.7.4)
```

Um cuidado que fica registrado: entre o fim do build e a troca de versao, o
codigo **antigo** ainda serve contra o schema **novo**. Para migration aditiva
isso e inofensivo. A `003` (canonicaliza UPC-A) e de dados: nessa janela, a
versao antiga ainda grava UPC-A de 12 digitos, e a `003` nao roda de novo. A
janela e curta e o efeito e uma linha duplicada que o usuario pode remover - mas
existe.

Nao foi implementado nenhum mecanismo de migration automatica no start. Isso e
decisao de operacao, e o modelo atual - migration no build - ja tem a
propriedade mais importante: falhou, nao publica.

## Verificar um deploy

```bash
npm run verify:deploy -- https://nutriscan-h1wp.onrender.com
```

Ou com variavel:

```bash
DEPLOY_URL=https://nutriscan-h1wp.onrender.com npm run verify:deploy
```

Sem URL, o comando falha e explica - nunca assume localhost.

```text
D1  versao no ar IGUAL a do package.json local (o achado R3 virando gate)
D2  responde por HTTPS, e http:// redireciona para https://
D3  HSTS (max-age >= 180 dias), CSP e nosniff presentes
D4  rota /api inexistente da 404 de API em JSON, nao o index.html
D5  /api/auth/me, /api/history, /api/favorites e /api/profile dao 401 sem sessao
D6  JSON quebrado provoca erro sem vazar stack, SQL, tabela nem caminho
D7  o HTML e servido e todos os scripts e estilos que ele referencia carregam
D8  nenhuma chave nem string de conexao no HTML ou nos bundles
```

Cada subgate sai como `PASS`, `FAIL` ou `NOT_EXECUTED`. **Exit 0 so com os oito
em PASS.** `NOT_EXECUTED` nao e aprovacao: nao olhar nao prova ausencia.

**Somente leitura.** Nao cria conta, nao grava historico, nao chama a Anthropic.
Toda requisicao e GET, com uma excecao declarada: o D6 manda JSON quebrado para
`/api/__verify_deploy_inexistente`, caminho que nao corresponde a rota nenhuma. O
corpo e recusado pelo parser antes de chegar a qualquer handler. O teste `P13`
roda o comando contra o roteador real com um espiao contando cada requisicao, e
exige que nenhuma rota de escrita seja alcancada.

O plano free do Render adormece o servico; a primeira requisicao pode levar
quase um minuto. O tempo limite e de 60 s por requisicao, ajustavel por
`DEPLOY_TIMEOUT_MS`.

## Antes de publicar a v0.7.5

**Defina `FRONTEND_ORIGIN` no painel do Render antes do deploy.** A partir desta
versao o processo nao sobe sem ela. As outras tres obrigatorias ja estao no
`render.yaml` ou no painel.

Depois de publicar, rode o `verify:deploy` contra a URL. Ele so passa quando o
que esta no ar for exatamente a versao do repositorio.
