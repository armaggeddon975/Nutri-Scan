# NutriScan v0.7.6

NutriScan e um app web para consultar alimentos por nome ou codigo de barras,
ver tabela nutricional, identificar ingredientes sensiveis e conversar com um
assistente sobre rotulos e alergias.

Nesta versao, o frontend e o backend utilizam o mesmo motor deterministico de
alergias em `shared/`. O motor agora classifica cada evidencia individualmente,
em vez de remover trechos globais do texto. Assim, frases como `sem lactose e
contem leite integral` preservam a evidencia positiva de leite.

A baseline v0.5.3 separa a origem dos dados do produto:

```text
ingredients -> analise contextual
allergens -> presenca declarada
traces -> possivel traco
```

Com isso, `{ traces: "milk" }` e tratado como traco, enquanto
`{ allergens: "milk" }` continua sendo presenca declarada.

## Funcionalidades

- Scanner de codigo de barras com ZXing.
- Consulta local e Open Food Facts.
- Analise nutricional e alerta de alergias.
- Motor compartilhado para `contains`, `traces` e ausencia de conflito.
- Classificacao por ocorrencia com precedencia `contains > traces > none`.
- Nutri Assistente com IA generativa via backend quando configurada.
- Fallback local baseado em regras quando a IA nao esta disponivel.
- Modo visitante independente.
- Conta online com alergias sincronizadas via backend e PostgreSQL.

## Requisitos

- Node.js 20 ou superior.
- npm 10 ou superior.
- PostgreSQL 14 ou superior.
- Docker opcional para subir PostgreSQL de desenvolvimento.

## Configuracao

Instale as dependencias:

```bash
npm install
npm --prefix backend install
```

Crie `backend/.env` a partir de `backend/.env.example`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nutriscan
DATABASE_SSL=false
FRONTEND_ORIGIN=http://localhost:5173
SESSION_TTL_DAYS=30
SESSION_COOKIE_NAME=nutriscan_session
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
ANTHROPIC_TIMEOUT_MS=20000
ANTHROPIC_MAX_OUTPUT_TOKENS=1200
```

O backend carrega `backend/.env` automaticamente usando caminho absoluto. Se a
mesma variavel ja existir no sistema operacional ou hospedagem, ela tem
prioridade sobre o arquivo local.

Em desenvolvimento nenhuma variavel e obrigatoria. Em producao quatro sao, e o
backend nao sobe sem elas - ver [Deploy](#deploy).

## Como rodar

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run dev:backend
```

Tudo junto:

```bash
npm run dev:full
```

O frontend abre em `http://localhost:5173` e encaminha `/api` para
`http://localhost:3000`.

## Diagnostico de ambiente

```bash
npm run doctor
npm run doctor:e2e
```

`npm run doctor` e diagnostico. Ele roda usando apenas modulos internos do
Node.js e funciona em uma copia recem-extraida do ZIP, antes de qualquer
`npm install`. Nesse cenario ele reporta:

```text
[OK] Node.js
[OK] npm
[WARN] Frontend dependencies - run npm install
[WARN] Backend dependencies - run npm --prefix backend install
```

Dependencias sao verificadas por resolucao real de modulos (`vite`, `react`,
`express`, `pg`, `dotenv`, `@anthropic-ai/sdk`), entao um `node_modules` incompleto aparece
como `WARN`, nunca como `OK`. Ausencia de PostgreSQL ou Anthropic e `WARN` e nao
derruba o comando.

`npm run doctor:e2e` e o modo strict. Ele exige dependencias, `DATABASE_URL`,
PostgreSQL acessivel, migrations aplicadas, `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL`.
Faltando qualquer item, o exit code e diferente de zero. Secrets nunca sao
impressos: chave e banco aparecem apenas como `configured` ou `not_configured`.

## Validacao de codigo

```bash
npm run verify:release
```

Escopo: doctor normal, build, testes do backend, `npm audit` do frontend e do
backend e secret scan. Isso valida o codigo. **Nao e E2E aprovado**: nao prova
PostgreSQL real, Claude real nem o fluxo autenticado.

Comandos individuais:

```bash
npm run build
npm --prefix backend test
npm audit --audit-level=high
npm --prefix backend audit --audit-level=high
```

## Validacao E2E real

```bash
npm run verify:e2e
```

Este e o gate de infraestrutura real e **exige Claude real**. Ele executa
`doctor:e2e` e depois `e2e:strict`, e so retorna exit code 0 quando PostgreSQL
esta conectado, migrations rodaram, cadastro, login, `auth/me`, alergias,
multi-dispositivo, isolamento, logout e assistente autenticado passaram, e as
chamadas reais ao Claude foram validadas.

A autorizacao de chamada paga e explicita. Sem
`RUN_ANTHROPIC_INTEGRATION_TESTS=true`, o gate recusa antes de subir qualquer
processo:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
       E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
```

Isso vale mesmo com PostgreSQL no ar e chave configurada: sem a flag o resultado
e FAIL, nunca PASS sem Claude real.

O gate tambem recusa `E2E_BASE_URL`: ele precisa subir e provar o backend deste
repositorio, porque uma API externa pode fabricar a resposta da IA. Para validar
staging, use `npm run e2e:strict` diretamente, que aceita a variavel.

Requisitos:

```text
PostgreSQL rodando
DATABASE_URL configurada em backend/.env
```

Como habilitar o gate completo:

```text
ANTHROPIC_API_KEY configurada
RUN_ANTHROPIC_INTEGRATION_TESTS=true
```

Sem `RUN_ANTHROPIC_INTEGRATION_TESTS=true`, nenhuma chamada paga acontece: se a
Anthropic for exigida sem a flag, o runner falha antes de chamar. Com a flag
ligada, o limite e de duas chamadas reais por execucao (pergunta generica e
produto com conflito).

Variantes:

```bash
npm run e2e:real
npm run e2e:strict
```

`e2e:real` e flexivel e registra `NAO EXECUTADO` quando PostgreSQL ou Anthropic nao
estao disponiveis. `e2e:strict` transforma essas ausencias em `FAIL`.

O runner sobe um backend temporario automaticamente e o encerra ao final, em
sucesso, falha ou interrupcao. Para testar staging, container ou servidor
externo, informe a URL e nenhum processo local sera iniciado:

```bash
E2E_BASE_URL=https://staging.exemplo/api npm run e2e:strict
```

Outras variaveis opcionais do runner:

```text
E2E_STARTUP_TIMEOUT_MS  espera do /health (padrao 30000)
E2E_REQUIRE_ANTHROPIC      exige Claude real, sempre respeitando a flag
E2E_WRITE_REPORT        grava E2E_LAST_RUN.json sanitizado
```

Contas temporarias usam o dominio reservado `@example.test` e sao removidas ao
final, inclusive quando algum passo falha.

## Consulta de produto

Dois caminhos, um resultado:

```text
camera   aponte para o codigo de barras
digitado campo "Ou digite o codigo", sempre visivel na tela da camera
```

O campo de digitacao **nao aparece so quando a camera falha**. Ele fica sempre
la: digitar costuma ser mais rapido que enquadrar uma embalagem amassada, e
funciona sem permissao de camera, sem HTTPS e em aparelho sem camera nenhuma.

Os dois caminhos entram no mesmo fluxo - mesma busca, mesmo motor
deterministico, mesmo veredito de alergia. O mesmo codigo devolve o mesmo
resultado venha de onde vier.

### Conferencia do digito verificador

O codigo digitado e conferido **antes de qualquer consulta a rede**:

```text
aceitos    EAN-13 (13 digitos), EAN-8 (8) e UPC-A (12)
separador  espaco e hifen sao removidos, e a tela mostra o que sera buscado
recusa     qualquer outro caractere, tamanho fora dos tres, ou digito errado
```

Isso nao e polimento de interface. Num app de alergia, um digito digitado
errado nao devolve "produto nao encontrado": devolve OUTRO PRODUTO, que existe
e tem outros alergenicos. O digito verificador pega todo erro de um unico
digito, que e a classe mais comum ao digitar.

As duas recusas sao mensagens diferentes de proposito:

```text
digito errado    "Esse codigo nao existe. Confira numero por numero."
fora da base     "Produto <codigo> nao esta cadastrado na Open Food Facts."
```

A primeira manda conferir o que foi digitado; a segunda diz que o codigo esta
certo e o produto e que nao esta la.

Um UPC-A de 12 digitos e normalizado para EAN-13 com zero a esquerda, para que o
mesmo produto escaneado e digitado nao vire duas linhas de historico.

A conferencia vive em `shared/barcode.js` e e usada pelo frontend **e** pelo
backend. A do frontend e conveniencia; a do backend e a que vale.

### O codigo guardado e sempre a forma canonica

Um UPC-A de 12 digitos vira EAN-13 com zero a esquerda **no servidor**, antes de
chegar ao banco. Vale para todo caminho: digitado, escaneado ou requisicao
direta a API.

Sem isso, o mesmo produto lido pela camera e digitado a mao viraria duas linhas
de historico, e favoritar por um caminho nao apareceria como favoritado pelo
outro - a unicidade e `(user_id, product_code)`. Era exatamente o que acontecia
ate a v0.7.3.

Codigo que nao e EAN/UPC - ITF-14, alfanumerico da Open Food Facts - passa
intacto. Canonicalizar esses seria inventar um codigo que nao existe.

Quem ja usava o app antes da v0.7.4 nao precisa fazer nada: a migration `003`
canonicaliza as linhas antigas na proxima subida. Quando as duas formas do mesmo
produto existirem na mesma conta, a linha canonica sobrevive; o historico fica
com a data de visualizacao mais recente das duas, e o favorito com a data de
criacao mais antiga.

O caminho da camera nao reconfere o digito de EAN, e isso e intencional: a
`@zxing` ja confere o checksum da simbologia ao decodificar, e o scanner
tambem le ITF e CODE_128, que nao tem digito verificador de EAN.

## Historico e favoritos

Todo produto aberto entra no historico. Reabrir o mesmo produto atualiza o
registro em vez de criar outra linha, entao a lista nao enche de repeticao.

Favoritar e um toque no botao do proprio produto. As duas listas ficam em
**Meus produtos**.

```text
com conta   PostgreSQL e a fonte de verdade; aparece em qualquer aparelho
sem conta   fica so no navegador daquele aparelho, e a tela avisa isso
```

Nao existe migracao automatica do que foi salvo sem conta para a conta no
login. Mover dado local para o servidor sem o usuario pedir e mudanca de
contrato: ele pode ter marcado produtos num aparelho emprestado.

### Limites

```text
historico   100 itens; ao estourar, o mais antigo sai sozinho
favoritos   200 itens; ao estourar, a API recusa com 409
```

A diferenca e proposital. O historico e automatico, e descartar o item mais
antigo nao desfaz escolha nenhuma. Favorito e intencao explicita: apagar um em
silencio para caber outro apagaria uma decisao do usuario, entao quem decide o
que sai e ele.

### O veredito de alergia nunca e guardado

As tabelas guardam apenas identidade do produto - codigo, nome, marca e imagem.
Nenhum veredito, nivel de risco ou lista de alergenicos.

O perfil de alergia muda com o tempo. Um veredito congelado em marco vira
informacao de seguranca errada em abril, quando a pessoa marca uma alergia nova.
O veredito e sempre recalculado pelo motor deterministico na hora de exibir, com
o perfil atual.

## Deploy

O deploy e descrito por `render.yaml`, um blueprint do Render versionado no
repositorio. Um unico web service serve a API e o frontend ja compilado, na
mesma origem - o que evita CORS e cookie de terceiro.

```text
servico    web, runtime node, plano free, nome "nutriscan"
health     /api/health
build      npm ci --include=dev && npm --prefix backend ci && npm run build
           && npm run db:migrate
start      npm start
```

`--include=dev` no build e obrigatorio: com `NODE_ENV=production` o `npm ci`
descarta devDependencies, e o Vite, que compila o frontend, e devDependency.
Sem isso o build morre com "vite: not found".

O PostgreSQL fica no **Neon**, nao no Render: o plano gratuito do Render expira
em 90 dias e apaga os dados.

**Para publicar, siga o checklist em [docs/DEPLOY.md](docs/DEPLOY.md).** Ele foi
escrito para quem publica: o que preencher no painel, como as migrations
entram, como verificar o resultado e o que fazer quando um subgate falha. As
decisoes de HTTPS, cookie e migrations tambem estao la.

As versoes 0.7.1 a 0.7.6 ainda nao foram publicadas; o servico no ar roda a
0.7.0.

### Variaveis obrigatorias em producao

Com `NODE_ENV=production`, o backend **recusa subir** se faltar qualquer uma
destas, ou se um booleano nao for `true`/`false`. A mensagem diz qual variavel
falta - nunca o valor de nenhuma.

```text
DATABASE_URL      string de conexao do Neon                    painel (sync: false)
DATABASE_SSL      true                                         render.yaml
FRONTEND_ORIGIN   https://nutriscan-h1wp.onrender.com          painel (sync: false)
TRUST_PROXY       true - o Render tem um proxy na frente       render.yaml
```

Ate a v0.7.4, `FRONTEND_ORIGIN` ausente caia em `http://localhost:5173` em
producao, sem aviso. `FRONTEND_ORIGIN` precisa ser `https://` e so a origem,
sem caminho nem barra no fim.

**Antes de publicar, defina `FRONTEND_ORIGIN` no painel do Render.** Sem ela, a
versao nova nao sobe. Desde a v0.7.6 um teste confere que toda obrigatoria do
codigo esta declarada no `render.yaml`, e que nenhuma credencial tem valor no
arquivo.

Opcionais, com default:

```text
ANTHROPIC_API_KEY            sem ela o assistente cai para a resposta local
ANTHROPIC_MODEL              claude-sonnet-5
ANTHROPIC_TIMEOUT_MS         20000
ANTHROPIC_MAX_OUTPUT_TOKENS  1200
SESSION_TTL_DAYS             30
SESSION_COOKIE_NAME          nutriscan_session
PORT                         3000 - o Render injeta a sua
```

### Nao existe `SESSION_SECRET` - de proposito

Quem configura producao costuma procurar essa variavel. Ela nao existe neste
projeto, e nao deve ser criada.

A sessao e um **token opaco**: 32 bytes aleatorios no cookie, e no banco so o
hash SHA-256 dele. Nao ha cookie assinado, entao nao ha o que assinar:

- o cliente nao carrega dado nenhum que o servidor precise confiar - so um
  numero aleatorio sem significado;
- revogar uma sessao e apagar a linha dela no banco (`DELETE`), e o logout faz
  exatamente isso;
- quem ler o banco ve o hash, nao o token.

Um segredo de sessao aqui seria uma credencial a mais para guardar, rotacionar
e vazar, sem proteger nada. Detalhe em [docs/DEPLOY.md](docs/DEPLOY.md).

### Migrations

As migrations rodam no **build** (`npm run db:migrate`, ultimo passo do
`buildCommand`), nao no start. Se uma migration falhar, o build falha e o Render
mantem a versao anterior no ar. Cada migration e registrada em
`schema_migrations` e nao roda duas vezes.

Para aplicar a mao, contra o banco da `DATABASE_URL`:

```bash
npm run db:migrate
```

### Verificar o deploy

```bash
npm run verify:deploy https://nutriscan-h1wp.onrender.com
```

Prova, contra a URL publicada, que o que esta no ar e o que foi auditado. Sao
oito subgates, D1 a D8: versao igual a do repositorio, HTTPS com redirecionamento,
cabecalhos de seguranca, 404 de API em JSON, 401 sem sessao, erro sem vazamento,
frontend servido e nenhuma chave nos bundles. Exit 0 so com os oito em PASS.

O comando so le. Nao cria conta, nao grava nada e nao chama a IA. Sem URL, ele
falha - nunca assume localhost. E separado do `verify:e2e`, que prova o backend
local.

### Conferir a versao publicada

Publicar sem incrementar a versao faz `/api/health` anunciar um numero que nao
corresponde ao codigo em execucao. Ja aconteceu: os commits `9622ad8` e
`168ae69` foram ao ar sob o numero 0.6.8.

```bash
npm run version:check -- https://exemplo.onrender.com
```

Compara a versao de `package.json` com a que o deploy anuncia em `/api/health`.
Exit 0 quando batem, exit 1 quando divergem. Falha de consulta tambem e exit 1:
nao conseguir perguntar nao e aprovacao.

Este comando nao roda em CI de proposito. Exigir rede em CI transforma
indisponibilidade de terceiro em build vermelho, e o objetivo dele e conferir um
deploy, nao barrar um commit.

Desde a v0.7.5, a mesma comparacao e o subgate D1 do `verify:deploy`.

## Seguranca

- Nome de usuario e unico, alem do e-mail. Duas pessoas com o mesmo nome nao
  conseguem ter conta: o login aceita e-mail **ou** nome, e nomes repetidos
  fariam a entrada por nome escolher uma conta qualquer entre as homonimas.
- A recusa de cadastro nao diz se foi o e-mail ou o nome que ja existe, para
  nao permitir descobrir quem tem conta testando uma lista de e-mails.
- Sessao em cookie HttpOnly, SameSite=Lax e, em producao, Secure.
- CORS so para a origem de `FRONTEND_ORIGIN`; a origem do request nunca e
  refletida.
- Erro interno chega ao cliente como frase generica, sem stack, SQL nem caminho;
  o detalhe vai para o log do servidor.
- Token de sessao salvo no banco apenas como hash SHA-256.
- Senhas com `crypto.scrypt`, salt unico e comparacao segura.
- Nenhuma chave secreta no frontend.
- Chave Anthropic somente no backend.
- Chamadas Claude usam a Messages API com Structured Outputs.
- Sessoes guardam apenas `token_hash`; o E2E inspeciona `information_schema`
  para confirmar que nao existe coluna de token bruto.
- A IA explica o snapshot deterministico; ela nao decide alergia sozinha.
- O assistente e informativo e nao substitui medico ou nutricionista.

### Limite de requisicoes

```text
auth          40 / 15 min   por IP
assistente    20 / 10 min   por IP
colecoes     300 / 10 min   por USUARIO   e   3000 / 10 min por IP
```

As rotas de historico e favoritos passam pelos dois ultimos ao mesmo tempo:
passar exige caber nos dois, e qualquer um deles recusando devolve 429.

Os dois existem porque resolvem coisas diferentes. O teto por usuario impede
que uma conta encha a propria tabela e protege quem esta atras de NAT ou CGNAT,
onde varias pessoas compartilham um endereco. O teto por IP impede que alguem
contorne o primeiro simplesmente criando contas - sem ele, quatro contas do
mesmo endereco passavam 1200 requisicoes.

O teto por usuario e conferido primeiro, para que as requisicoes recusadas de um
usuario abusivo nao consumam o orcamento de IP dos vizinhos.

**Nao ha variavel de ambiente para nenhum dos dois.** Os valores sao constantes
em `backend/src/middleware/rateLimit.js` (`TETO_COLECOES_POR_USUARIO` e
`TETO_COLECOES_POR_IP`), e nenhuma variavel, cabecalho, query string ou cookie
desliga os limitadores. Mudar um deles e alteracao de codigo, revisavel, e
quebra os testes `R6` e `R7` se a medicao que sustenta o numero nao for
atualizada junto.

O teto de 3000 por IP vem de medicao, descrita em `docs/ARCHITECTURE.md`.

## Limite semantico milk/lactose

O ID legado `milk` representa hoje `Leite/lactose` para manter compatibilidade
com dados salvos. Por isso, `sem lactose` nao e interpretado automaticamente
como `sem proteinas do leite`. Se o rotulo tambem trouxer `leite`, `whey`,
`caseina` ou `proteina do leite`, o motor marca `milk` como `contains`.

## Documentacao

- [API](docs/API.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Deploy](docs/DEPLOY.md)
- [Nutri Assistente IA](docs/AI_ASSISTANT.md)
- [Relatorio de auditoria](AUDIT_REPORT.md)
- [Relatorio E2E](E2E_REPORT.md)
