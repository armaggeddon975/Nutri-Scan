# Publicar o NutriScan - v0.9.0

Este documento e para **quem vai publicar**, nao para quem escreveu o codigo.
Siga na ordem. Nenhum passo pede para adivinhar.

**Situacao hoje:** as versoes 0.7.1 a 0.9.0 nunca foram publicadas. O servico
`nutriscan` no Render ainda roda a 0.7.0.

Nenhum valor real de credencial aparece aqui. Onde houver `<...>`, troque pelo
seu valor.

---

## Parte 1 - Checklist de publicacao

### 1. Pre-requisitos

- [ ] **Conta no Render** com o servico web `nutriscan` (o `render.yaml` da raiz
      descreve o servico). Qualquer hospedagem Node com proxy HTTPS na frente
      serve, mas este roteiro usa o Render.
- [ ] **Um banco PostgreSQL provisionado** - o projeto usa o Neon - e a string de
      conexao dele. Ela comeca com `postgresql://` e, no Neon, termina com
      `sslmode=require`.
- [ ] **Uma chave da Anthropic**, so se quiser o assistente com IA. Sem ela o app
      funciona: o assistente responde localmente e o veredito de alergia nao
      muda (ver o passo 9).
- [ ] **Node 20 ou superior** na sua maquina, para rodar a verificacao do passo 6.

### 2. Variaveis de ambiente - o que preencher no painel

No Render: servico `nutriscan` -> **Environment**.

```text
variavel                     obrigatoria  onde e lida          se faltar em producao                    no render.yaml     o que preencher no painel
---------------------------  -----------  -------------------  ---------------------------------------  -----------------  -----------------------------------------
DATABASE_URL                 SIM          env.js (db, migr.)   o processo NAO SOBE; o build falha na     sim, sync: false   a string de conexao do Neon
                                                               migration
DATABASE_SSL                 SIM          env.js -> pool       o processo NAO SOBE                       sim, "true"        nada - ja vem do arquivo
FRONTEND_ORIGIN              SIM          env.js -> CORS       o processo NAO SOBE; http:// tambem nao   sim, sync: false   https://<url-publicada>
TRUST_PROXY                  SIM          env.js -> app.js     o processo NAO SOBE                       sim, "true"        nada - ja vem do arquivo
ANTHROPIC_API_KEY            nao          env.js -> ai/        sobe; assistente local; health diz        sim, sync: false   a chave, se quiser IA
                                                               ai: not_configured
NODE_ENV                     nao (*)      env.js, server.js    ausente: development. Valor desconhecido  sim, production    nada - ja vem do arquivo
                                                               (producao, prod): o processo NAO SOBE
NODE_VERSION                 nao          o proprio Render     o Render usa a versao padrao dele         sim, "22"          nada - ja vem do arquivo
ANTHROPIC_MODEL              nao          env.js -> ai/        claude-sonnet-5                           sim                nada - ja vem do arquivo
SESSION_TTL_DAYS             nao          env.js -> sessao     30 dias                                   sim, "30"          nada - ja vem do arquivo
PORT                         nao          env.js               3000; o Render sempre injeta a dele       nao (injetada)     nada
SESSION_COOKIE_NAME          nao          env.js -> sessao     nutriscan_session                         nao                nada
ANTHROPIC_TIMEOUT_MS         nao          env.js -> ai/        20000                                     nao                nada
ANTHROPIC_MAX_OUTPUT_TOKENS  nao          env.js -> ai/        1200                                      nao                nada
```

(*) `NODE_ENV` ausente faz o app rodar como desenvolvimento - e o caso de quem
roda local. O `render.yaml` a fixa em `production`, entao no Render ela ja vem
certa. Um valor digitado errado no painel - `producao`, `prod`, `staging` -
**impede o processo de subir**, a partir da v0.8.0:

```text
NutriScan NAO subiu: NODE_ENV nao reconhecido.
  - NODE_ENV: valor nao reconhecido; use development, test ou production
Defina as variaveis no painel da hospedagem. Nenhum valor e impresso aqui.
```

Ate a v0.7.6 esse erro virava desenvolvimento em silencio, desligando de uma vez
o cookie `Secure` e a checagem das obrigatorias.

**So tres coisas sao preenchidas a mao:** `DATABASE_URL`, `FRONTEND_ORIGIN` e,
se quiser IA, `ANTHROPIC_API_KEY`. Todas sao `sync: false` no `render.yaml`: o
valor mora so no painel e nunca entra no Git. O resto ja vem do arquivo.

**`FRONTEND_ORIGIN` e so a origem:** esquema e host, com `https://`, sem barra no
fim e sem caminho. Exemplo de forma: `https://<url-publicada>`.

Se faltar uma obrigatoria, o log do deploy mostra isto - com o nome, nunca o
valor:

```text
NutriScan NAO subiu: configuracao de producao incompleta.
  - FRONTEND_ORIGIN: ausente ou vazia
Defina as variaveis no painel da hospedagem. Nenhum valor e impresso aqui.
```

**Nao procure `SESSION_SECRET`.** Ela nao existe neste projeto, de proposito -
ver "Por que nao ha segredo de sessao", na Parte 2.

### 3. Como as migrations sao aplicadas

**No BUILD, nunca no start.** O `buildCommand` do `render.yaml` termina em
`npm run db:migrate`, rodando com a `DATABASE_URL` do painel. O `startCommand`
(`npm start`) so sobe o servidor e nao toca no schema.

```text
a migration falha   o build falha, e o Render MANTEM a versao anterior no ar
a migration passa   a versao nova so sobe com o schema que ela espera
de novo             cada migration fica em schema_migrations e e pulada da
                    segunda vez em diante - publicar duas vezes e seguro
```

Voce nao roda migration a mao para publicar. Se precisar rodar fora do Render,
contra o banco da `DATABASE_URL` do seu ambiente:

```bash
npm run db:migrate
```

**Se a migration falhar, o log do build diz por que.** Saida real, medida com a
`DATABASE_URL` apontando para uma porta fechada em `localhost`:

```text
Migration falhou:
codigo ECONNREFUSED
  - connect ECONNREFUSED ::1:1
  - connect ECONNREFUSED 127.0.0.1:1
```

Ate a v0.7.6 essa falha saia com o log EM BRANCO: uma conexao recusada a um host
com IPv4 e IPv6 vira `AggregateError`, cuja mensagem e vazia, e o script
imprimia so a mensagem. A string de conexao nunca aparece - nem numa
`DATABASE_URL` malformada.

### 4. Publicar

Envie os commits para o GitHub. O Render publica a partir do `main`:

```bash
git push origin main
```

Se o deploy nao comecar sozinho: **Manual Deploy -> Deploy latest commit**.
Acompanhe em **Logs**. O deploy terminou quando o log mostra
`NutriScan API v<versao> ouvindo na porta ...`.

### 5. Primeira publicacao de um servico NOVO

So vale se o servico for criado do zero. A URL publica so existe depois de o
servico ser criado, e sem `FRONTEND_ORIGIN` o processo nao sobe. Entao:

1. crie o servico e deixe o primeiro deploy falhar;
2. copie a URL que o Render atribuiu;
3. preencha `FRONTEND_ORIGIN` com ela e reimplante.

Para o servico `nutriscan`, que ja existe, a URL e conhecida: preencha antes do
push.

### 6. Verificar o que foi publicado

```bash
npm run verify:deploy https://<url-publicada>
```

A mesma coisa, com a URL por variavel:

```bash
DEPLOY_URL=https://<url-publicada> npm run verify:deploy
```

O comando roda da sua maquina, contra a URL publica. **Ele so le:** nao cria
conta, nao grava nada, nao chama a IA. Pode ser rodado a qualquer momento,
quantas vezes quiser - antes, durante ou depois de uma publicacao.

Exit 0 so com os oito subgates em PASS. `NOT_EXECUTED` nao e aprovacao.

O plano free do Render adormece o servico. A primeira requisicao pode levar
quase um minuto; o limite e 60 s por requisicao e sobe com `DEPLOY_TIMEOUT_MS`.

### 7. O que cada subgate prova

```text
D1  a versao no ar e IGUAL a do package.json do repositorio
D2  o servico responde por HTTPS, e http:// redireciona para https://
D3  HSTS (180 dias ou mais), CSP e nosniff estao nos cabecalhos
D4  uma rota /api que nao existe da 404 de API em JSON, nao a pagina do app
D5  quatro rotas que exigem login respondem 401 sem sessao
D6  um corpo invalido provoca erro sem vazar stack, SQL, tabela nem caminho
D7  a pagina e servida, e cada script e estilo que ela cita carrega
D8  nenhuma chave nem string de conexao aparece no HTML ou nos scripts
```

### 8. Quando um subgate falha - a causa mais provavel

```text
D1  O deploy nao terminou, ou o build falhou e o Render manteve a versao
    anterior. Veja o ultimo deploy em Events/Logs. Se o build passou: o push
    nao foi feito, ou a versao nao foi incrementada nos package.json.

D2  A URL foi informada com http://. Ou o dominio e proprio e o certificado
    ainda nao foi emitido. O redirecionamento e feito pelo proxy do Render, nao
    pelo app.

D3  Um proxy ou CDN na frente do Render esta removendo cabecalhos. Ou o que
    responde ainda e uma versao antiga.

D4  A pagina do app esta engolindo rotas /api. Causa comum: o frontend esta
    sendo servido por outro lugar (CDN estatica, regra de reescrita) em vez do
    backend.

D5  Se a rota respondeu 500: o banco esta inacessivel - confira DATABASE_URL e
    DATABASE_SSL. Se respondeu 200: a autenticacao esta quebrada - GRAVE, nao
    publique por cima e investigue.

D6  NODE_ENV esta como development no painel, e o erro esta saindo com
    detalhe. Confira a variavel; o render.yaml a fixa em production. (Um
    valor desconhecido nem chega aqui: o processo nao sobe.)

D7  O build do frontend nao rodou: alguem tirou o --include=dev do
    buildCommand, ou o build falhou antes do vite. Sem o dist/, a raiz responde
    JSON em vez da pagina.

D8  Uma chave ou string de conexao foi parar no codigo do frontend - por
    exemplo, numa variavel VITE_*. Revogue a chave IMEDIATAMENTE no painel do
    fornecedor; o bundle ja foi servido. Se o D8 der NOT_EXECUTED, o D7 falhou
    antes: resolva o D7.

Sem resposta nenhuma (todos FAIL por tempo): o servico estava dormindo ou fora
do ar. Rode de novo; se persistir, aumente DEPLOY_TIMEOUT_MS e veja os Logs.
```

### 9. Sem chave da IA, o que muda

So o assistente. Sem `ANTHROPIC_API_KEY` ele responde com a resposta local, e o
`/api/health` mostra `ai: not_configured`.

**O veredito de alergia NAO depende de IA.** Quem decide se um produto conflita
com o perfil e o motor deterministico em `shared/`, igual com ou sem chave. A
IA so explica; ela nunca decide alergia.

### 10. Antes de considerar publicado

- [ ] Os oito subgates em PASS, com exit 0.
- [ ] O `/api/health` mostra a versao nova e `database: connected`.
- [ ] Se preencheu a chave: `ai: configured`.

---

## Parte 2 - Por que e assim

### Por que nao ha segredo de sessao (O1)

**O NutriScan nao usa `SESSION_SECRET`, e isso e uma decisao, nao um
esquecimento.** Quem configura producao costuma procurar essa variavel; ela nao
existe aqui, e nao deve ser criada.

A sessao nao e um cookie assinado. E um **token opaco**:

```text
login     o backend gera um token aleatorio de alta entropia e o manda no
          cookie (HttpOnly, Secure, SameSite=Lax)
banco     guarda so o HASH SHA-256 do token, na tabela sessions
pedido    o backend calcula o hash do cookie e procura a sessao no banco
logout    a linha da sessao e apagada - DELETE - e o token deixa de valer
```

Por isso nao ha o que assinar:

- **o cliente nao carrega dado nenhum** que o servidor precise confiar - so um
  numero aleatorio sem significado. Assinatura protege conteudo; aqui nao ha
  conteudo;
- **revogar e apagar uma linha.** Com cookie assinado, a sessao vale ate expirar,
  e derrubar todas exige trocar o segredo;
- **vazar o banco nao entrega sessao:** o banco tem o hash, nao o token.

Um `SESSION_SECRET` aqui seria uma credencial a mais para guardar, rotacionar e
vazar, protegendo nada.

### HTTPS: redirecionamento no Render, HSTS no backend

```text
redirecionamento http -> https   no proxy do Render, nao no backend
Strict-Transport-Security        no backend (helmet), max-age de 1 ano
upgrade-insecure-requests        na CSP, so em producao
```

**Por que o backend NAO redireciona.** O Render termina TLS no proxy e
redireciona http para https na borda, para todo servico `onrender.com`. Um
redirecionamento no proprio backend, baseado em `req.secure`, teria dois riscos:
o health check do Render bate na porta interna, e um redirect o derrubaria; e com
`trust proxy` errado, `req.secure` mente e o redirect pode entrar em laco.

**Por que o backend manda HSTS assim mesmo.** Defesa em profundidade: depois do
primeiro acesso, o navegador passa a recusar http por conta propria. Se o
servico um dia for para outra plataforma, o HSTS continua.

### Cookie de sessao com SameSite=Lax

```text
httpOnly   true   o JavaScript da pagina nao le a sessao
secure     true   so trafega por https (em producao)
sameSite   lax
path       /
maxAge     SESSION_TTL_DAYS - o mesmo valor que define a expiracao no banco
```

Frontend e API estao na mesma origem, entao toda chamada do app e de mesmo site
e o cookie vai junto. `lax` recusa o cookie em subrequisicao de outro site - a
forma classica de CSRF.

**Se a arquitetura mudar:** `onrender.com` esta na Public Suffix List.
`frontend.onrender.com` e `api.onrender.com` seriam SITES DIFERENTES. Separar
frontend e API em dois servicos do Render quebraria o login com `lax`, e a saida
facil - `none` - abriria CSRF. Se um dia separar, use dominio proprio.

### Migrations no build

Falhou, nao publica - e a propriedade mais importante, e o modelo atual ja a
tem. Um cuidado registrado: entre o fim do build e a troca de versao, o codigo
**antigo** ainda serve contra o schema **novo**. Para migration aditiva isso e
inofensivo. A `003` (canonicaliza UPC-A) e de dados: nessa janela, a versao
antiga ainda pode gravar UPC-A de 12 digitos, e a `003` nao roda de novo.

Nao ha migration automatica no start. Isso e decisao de operacao.

### Sincronia entre o codigo e o `render.yaml` (v0.7.6)

`backend/tests/renderSync.test.js` le o `render.yaml` e reprova se:

- uma obrigatoria de `VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO` nao estiver nele;
- ele declarar variavel que o codigo nao le - salvo `NODE_VERSION`, que e lida
  pelo proprio Render, declarada como caso conhecido no teste;
- uma credencial tiver valor literal, ou nao for `sync: false`;
- o arquivo mostrar qualquer endereco `http://`.

`ANTHROPIC_API_KEY` e o outro caso conhecido: nao e obrigatoria para subir, mas
o teste exige que ela esteja no `render.yaml`, para que producao sem IA seja
decisao, e nao esquecimento.

### Rotas de conta (v0.8.0)

A v0.8.0 acrescenta `GET /api/account/export` e `DELETE /api/account`. Para
publicar, **nada muda**: nenhuma variavel nova, nenhuma migration nova. A cascata
que a exclusao usa ja existe no banco desde as migrations 001 e 002.

O `verify:deploy` **nao** testa essas rotas, de proposito: ele so le, e as duas
leem ou apagam dado de uma conta. Se quiser conferir depois de publicar, faca a
mao, com uma conta descartavel criada so para isso - nunca com a sua:

1. Crie uma conta de teste no app publicado e marque uma alergia.
2. Em **Conta > Seus dados**, "Baixar meus dados": o arquivo deve chamar
   `nutriscan-meus-dados-AAAA-MM-DD.json` e trazer a alergia.
3. "Excluir minha conta" com a senha ERRADA: deve aparecer "Senha incorreta.
   Nada foi apagado." e a conta continua.
4. De novo, com a senha certa: o app volta para a tela de entrada com "Sua conta
   foi excluida.", e o login com aquela conta passa a falhar.
5. Apague o arquivo baixado no passo 2.

A exclusao remove as linhas do banco em uso. O provedor do PostgreSQL pode
manter historico para restauracao por um prazo que depende do plano - o codigo
nao alcanca esse historico. Ver [DADOS_DO_TITULAR.md](DADOS_DO_TITULAR.md).

### Nivel de alerta por alergia (v0.9.0)

A v0.9.0 traz a migration `004_nivel_de_alerta.sql`, aplicada no build como as
outras. Ela acrescenta a coluna `user_allergies.alert_level`, com padrao
`standard`, e a restricao que so aceita `standard` ou `strict`. Toda alergia
que ja existe no banco fica `standard`: o comportamento de quem ja usa o app
nao muda ate a pessoa escolher o alerta maximo. Nenhuma variavel nova.

A migration e idempotente. Se o build falhar depois dela, rodar de novo nao
muda nada.

Depois de publicar, para conferir a mao (com uma conta descartavel):

1. Entre, marque Amendoim e, em **Alerta maximo**, marque Amendoim.
2. Abra um produto com amendoim nos ingredientes: a etiqueta deve dizer
   "Amendoim · alerta maximo".
3. Desmarque o alerta maximo e abra o mesmo produto: a etiqueta volta a ser so
   "Amendoim".

O `verify:deploy` nao toca nisso: ele so le, e a rota de alergias grava.

### Pontos de atencao conhecidos

- **`NODE_ENV` digitado errado:** ate a v0.7.6 virava desenvolvimento, em
  silencio. A partir da v0.8.0 o processo recusa subir - ver a nota (*) do
  passo 2.
- **Corpo grande demais (mais de 64 kB):** ate a v0.7.6 respondia 500. A partir
  da v0.8.0 responde 413 `PAYLOAD_TOO_LARGE`, reconhecido pela classe e pelo
  tipo do erro, como o 400 do JSON malformado.
- **Limite da exportacao:** 5 por dia por usuario e 20 por dia por IP. Quem
  testar a exportacao mais de cinco vezes no mesmo dia, com a mesma conta,
  recebe 429 ate a janela de 24 horas passar - e esperado.
