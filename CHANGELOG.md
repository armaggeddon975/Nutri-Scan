# Changelog

## NutriScan v0.8.0 - 2026-10-12

Direitos do titular: exportar os proprios dados e excluir a propria conta.
Minor, e nao patch: e capacidade nova de produto, nao correcao de defeito.

Isto descreve o que o software faz. Nao e parecer juridico, e esta versao nao
declara o NutriScan em conformidade com a LGPD - conformidade envolve base
legal, politica de privacidade e encarregado, que estao fora do codigo.

### O projeto segue NAO PUBLICADO

As versoes 0.7.1 a 0.8.0 nunca foram ao ar. O servico `nutriscan` no Render
continua rodando a **0.7.0**. Esta versao nao publica nada.

### A cascata existia; ninguem conseguia aciona-la

Toda tabela que referencia `users` ja tinha `ON DELETE CASCADE`:

```text
sessions            desde a v0.6.6   migration 001
user_allergies      desde a v0.6.6   migration 001
product_history     desde a v0.7.0   migration 002
product_favorites   desde a v0.7.0   migration 002
```

Mas nao havia rota nem tela que apagasse um usuario. O direito de eliminacao
existia no schema e nao existia no produto: a pessoa so conseguia sair da conta,
nunca apaga-la. Nem exportar o que o app guardava sobre ela - inclusive o perfil
de alergias, que e dado de saude.

(O prompt desta versao diz "desde a v0.7.0". Para historico e favoritos, sim;
para sessoes e alergias, a cascata e da v0.6.6 - conferido no `git log` das
migrations.)

### Entrega A - exportar meus dados

`GET /api/account/export`, com sessao. Devolve um JSON com `formato`,
`versaoDoFormato` e `geradoEm`, mais a conta (nome, e-mail, criacao), as
alergias, o historico e os favoritos.

- **Nunca** leva hash ou salt de senha, sessao, token, cookie, id interno de
  linha, `user_id`, dado de outra conta ou credencial. As consultas nomeiam
  coluna por coluna; um teste reprova `SELECT *` e qualquer citacao de
  `password` ou `token_hash` no repositorio.
- O titular e o dono da SESSAO. `userId` no corpo, na query ou em cabecalho e
  ignorado.
- Download direto: `Content-Disposition: attachment`, arquivo
  `nutriscan-meus-dados-AAAA-MM-DD.json` - sem e-mail nem nome.
- `Cache-Control: no-store` e `Pragma: no-cache`: nenhum cache guarda a
  resposta.
- Limitador proprio: **5 por 24 h por usuario e 20 por 24 h por IP**, mesmo
  desenho da v0.7.2 (usuario E IP, o mais restritivo vence), pela mesma fabrica,
  com baldes proprios. Raciocinio no codigo e em `docs/DADOS_DO_TITULAR.md`.

### Entrega B - excluir minha conta

`DELETE /api/account`, com sessao **e** a senha atual no corpo.

- A senha e conferida de novo contra o hash: sessao valida nao basta.
- Senha errada: 403 `INVALID_CREDENTIALS`, "Senha incorreta. Nada foi
  apagado." - e nada e apagado.
- A tentativa passa pelo limitador de AUTENTICACAO, o mesmo balde do login.
- Sessoes e usuario saem na MESMA transacao; alergias, historico e favoritos,
  pela cascata. Qualquer falha desfaz tudo.
- Exclusao FISICA: sem `deleted_at`, sem copia em outra tabela, sem conteudo no
  log. O log registra so "[conta] uma conta foi excluida pelo titular".
- Depois: cookie limpo, toda sessao da conta em 401 (nao 500), e-mail e nome
  livres para novo cadastro, vizinhos intactos.
- Nenhuma das duas rotas fala com a Anthropic.

### Interface

Na tela **Conta**, cartao **Seus dados**: "Baixar meus dados" e "Excluir minha
conta". A exclusao nao e um clique: abre um aviso, pede a senha e uma caixa
"Entendo que nao da para desfazer."; o botao "Excluir para sempre" so habilita
com as duas. O campo de senha e limpo depois de cada tentativa. Depois de
excluir, o app volta ao modo visitante com "Sua conta foi excluida.".

### Gate E2E: 18 -> 20 requisitos

`scripts/e2e-real.js` ganhou `accountExport` e `accountDeletion`, e
`buildStrictRequirements` os exige. Um teste novo confere os 18 requisitos da
v0.7.6 um a um - presentes e reprovando quando nao executados -, outro confere
que o total e exatamente 20. O subgate de exclusao usa uma conta propria
(`nutriscan-e2e-d-<carimbo>@example.test`), incluida na limpeza do gate. O
orcamento de requisicoes do gate ganhou o balde da exportacao.

`verify:deploy` continua somente leitura e NAO testa as rotas novas. O teste que
grava cada requisicao dele agora tambem trata `DELETE /api/account` como rota de
escrita proibida.

### Testes e mutacao

E1-E8 e D1-D9 em `backend/tests/accountIntegration.test.js` (PostgreSQL real) e
`backend/tests/account.test.js` (sem banco). O D4 varre TODA coluna uuid e de
texto de TODA tabela publica atras do id e do e-mail apagados, e confere a
cascata duas vezes: no banco em uso e num schema montado so pelas migrations. O
D8 provoca uma falha real no meio da cascata, com um gatilho.

`scripts/mutation-check.js` ganhou 16 mutantes para E2, E4, E5, D2, D4, D8 e
para os demais pontos da entrega. Rodada completa, com banco: **82 mutantes, 81
mortos, 1 sobrevivente**. O sobrevivente, W1, e equivalente: ele faz o
repositorio devolver a linha inteira de `users`, mas o servico monta o arquivo
campo a campo, e a exportacao nao muda. O mutante que poe o registro bruto no
arquivo (W1b) morre no E2, e a mudanca no repositorio e pega pela suite estatica
(`nunca usa SELECT *`). Detalhes em `AUDIT_REPORT.md`; o `mutation-check.js` nao
foi alterado depois do resultado.

### Correcoes autorizadas pelo dono do projeto, fora das secoes 6 e 7

O prompt desta versao fecha o escopo nas secoes 6 e 7. Estas correcoes foram
feitas e testadas entre a v0.7.5 e a v0.7.6, guardadas fora da v0.7.6 porque
batiam nas regras daquela versao, e o dono do projeto mandou incluir na
seguinte. Entram aqui por decisao dele, declaradas:

- **Leitura da camera nunca vira OUTRO codigo.** A camera le CODE_128, que
  aceita letra, e `cleanBarcode` apagava tudo que nao e digito: uma leitura como
  `AB7891000100103` virava `7891000100103`, o EAN valido de outro produto, com
  outros alergenicos. Leitura curta com letra caia ainda na busca por NOME.
  Agora a leitura da camera passa por `codigoLidoPelaCamera` (`src/utils/text.js`):
  so digitos, espaco e hifen perdem os separadores; letra, digito, `.`, `_` e
  `-` passam INTACTOS - na Open Food Facts viram "nao encontrado", nunca outro
  produto; qualquer outro caractere descarta a leitura; nada e cortado. E a
  camera nunca cai na busca por nome. Testes C2 em
  `backend/tests/productLookup.test.js`.
- **`NODE_ENV` desconhecido recusa subir.** `producao`, `prod`, `staging`
  viravam desenvolvimento em silencio - sem cookie `Secure`, com detalhe de
  erro. Agora o processo para e diz qual variavel, sem valor.
- **Migration que falha diz por que.** O log saia em branco numa conexao
  recusada (o erro agregado do Node nao tem mensagem propria); agora sai a
  mensagem, o codigo e cada erro interno - um por endereco tentado.
- **Corpo grande demais responde 413 `PAYLOAD_TOO_LARGE`**, e nao 500.
  Reconhecido pela classe e pelo tipo do erro, como o 400 da v0.7.6 - a versao
  guardada generalizava para "qualquer erro com `expose: true`", o que a v0.7.6
  proibiu; foi refeita restrita.
- **O doctor conta migrations `.js`**, e o `2/2 applied, 1 unknown` some.
- **O orcamento do gate mostra o teto por IP** ao lado do teto por usuario.
- **`env.test.js` nao escreve mais no `backend/.env` real**: cada teste monta um
  backend minimo numa pasta temporaria, com a mesma `env.js` copiada e um `.env`
  proprio. Antes, um processo morto no meio deixava o `.env` real trocado.
- **Teste opcional contra a Open Food Facts real**
  (`backend/tests/openFoodFacts.integration.test.js`), desligado por padrao.
- Documentacao: a linha "300 por IP" da `docs/API.md`, anterior a v0.7.2,
  corrigida; `NODE_ENV` e leitura da camera em `docs/ARCHITECTURE.md`; um
  comentario do `scripts/verify-deploy.js` corrigido (nenhuma linha de
  comportamento).

### O que esta versao NAO prova

- A leitura da camera em aparelho real: **NAO EXECUTADO**.
- O deploy real da 0.8.0: **NAO EXECUTADO** - nada foi publicado.

## NutriScan v0.7.6 - 2026-10-12

Prontidao de publicacao: que o primeiro deploy nao quebre por configuracao.

### O projeto segue NAO PUBLICADO

As versoes 0.7.1 a 0.7.6 nunca foram ao ar. O servico `nutriscan` no Render
continua rodando a **0.7.0**: os commits desde entao nunca foram enviados ao
GitHub, e publicar e acao do dono do projeto. Esta versao nao publica nada.

### O2 - erro do cliente virando erro do servidor

O auditor mediu em producao:

```text
POST /api/auth/login   corpo "{nao-e-json"   ->   500 INTERNAL_ERROR
```

Reproduzido nesta versao antes de qualquer correcao, com o mesmo resultado - e
com duas linhas `[erro interno]` no log do servidor que nao eram internas.

O corpo da resposta ja estava limpo. O defeito era o STATUS: o `express.json()`
entrega a falha de parse com `statusCode: 400` e `expose: true`, e o handler
jogava isso fora e respondia 500. Erro do cliente virava alerta de servidor, e o
cliente nao conseguia distinguir bug dele de bug nosso.

Agora a falha de parse do corpo responde **400 `INVALID_JSON`**, com mensagem
fixa e sem entrar no log como erro interno.

#### A restricao, que e a parte que importa

O atalho seria "respeitar o status de qualquer erro com `expose: true`". Isso
entregaria a escolha do status - e, com a mensagem junto, do texto - a qualquer
biblioteca que lance um erro com esses campos. Nao foi feito.

O handler reconhece UM caso, por dois sinais ao mesmo tempo: o erro e um
`SyntaxError` e traz `type: "entity.parse.failed"`. Copiar o `type` nao basta. E
mesmo nesse caso, status e mensagem saem do nosso codigo, fixos; nada do erro
original chega ao cliente. Todo o resto continua 500.

Os testes O2d provam o outro lado: erros de biblioteca com status 418, 401, 404
e 400 e `expose: true` - mais um que copia o `type` do body-parser - continuam
respondendo 500, sem a mensagem deles.

### Entrega A - o codigo e o `render.yaml` concordam, por teste

`backend/tests/renderSync.test.js` le o `render.yaml` e reprova se:

```text
S1  uma obrigatoria de VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO falta nele
S2  ele declara variavel que o codigo nao le
S3  uma credencial tem valor literal, ou nao e sync: false
5.3 o arquivo mostra qualquer endereco http://
```

Dois casos conhecidos estao DECLARADOS no teste, com comentario, em vez de
excecao silenciosa: `ANTHROPIC_API_KEY` (nao e obrigatoria para subir, mas tem
de estar no arquivo, para producao sem IA ser decisao e nao esquecimento) e
`NODE_VERSION` (lida pelo proprio Render, nao pelo codigo).

O leitor do `render.yaml` FALHA diante de formato que nao conhece, em vez de
pular a linha - um leitor tolerante poderia deixar passar justamente a variavel
que importa.

**O teste achou uma coisa na primeira execucao.** O comentario da
`FRONTEND_ORIGIN` no `render.yaml` mostrava `http://localhost:5173` - o default
antigo, citado como historia. Quem copiasse o exemplo mais proximo da variavel
levaria `http://` para o painel. O comentario foi reescrito sem nenhum endereco
`http://`.

### O1 - nao ha `SESSION_SECRET`, de proposito

A sessao e um token opaco: 32 bytes aleatorios no cookie, so o hash SHA-256 no
banco, revogada por `DELETE` no logout. Nao ha cookie assinado, entao nao ha o
que assinar. A ausencia agora esta explicada no README e no `docs/DEPLOY.md`,
para que quem configura producao nao a tome por esquecimento. O mecanismo de
sessao nao foi tocado.

### Dois alertas de seguranca novos, corrigidos

O `npm audit` desta versao apontou dois alertas publicados depois da v0.7.5:
`proxy-addr` (critico, no backend, via Express) e `source-map-js` (alto, no
build do frontend). O `proxy-addr` e o que calcula o `req.ip` atras de proxy -
de onde sai o balde do teto por IP. As versoes corrigidas (2.0.8 e 1.2.2) cabiam
nas faixas ja declaradas, entao so os lockfiles mudaram. Suite, gate E2E e
mutacao foram refeitos sobre o codigo final.

### Entrega C - checklist de publicacao

`docs/DEPLOY.md` foi reescrito para quem publica: pre-requisitos, a tabela de
variaveis com o que preencher no painel, como as migrations entram, o comando de
verificacao, o que cada subgate D1 a D8 prova e a causa mais provavel quando
cada um falha. Um teste amarra a tabela ao codigo: variavel nova lida pelo
backend e ausente do documento reprova.

## NutriScan v0.7.5 - 2026-10-02

Prontidao de producao, e um comando que prova que o que esta no ar e o que foi
auditado.

### O problema: auditado e no ar eram coisas separadas

Tudo o que `verify:release` e `verify:e2e` provavam valia para o backend LOCAL.
`render.yaml` e `scripts/version-check.js` existiam desde versoes anteriores, e
**nenhum dos dois tinha rodado contra o deploy real**. O projeto nunca tinha
sido verificado no ar.

O gate de versao desta entrega existe por causa do **achado R3** da auditoria da
v0.6.9: os commits `9622ad8` e `168ae69` foram publicados sob o numero 0.6.8, e
`/api/health` anunciava uma versao que nao correspondia ao que rodava. O projeto
ja tinha publicado as cegas uma vez.

#### Uma correcao na premissa

O prompt desta versao diz que o NutriScan "nunca foi publicado". Isso nao e
exato, e o registro correto e outro:

```text
publicado    SIM - https://nutriscan-h1wp.onrender.com esta no ar
verificado   NUNCA, ate esta versao
no ar        0.7.0, o codigo de 641aa5f
local        0.7.1 a 0.7.4 em seis commits que nunca subiram
```

O primeiro `verify:deploy` contra a URL real reprovou exatamente no D1: o
repositorio declara 0.7.5 e o deploy anuncia 0.7.0. Os outros sete subgates
passaram. **E o achado R3 acontecendo de novo, agora pego por um gate em vez de
por um auditor.**

### Entrega A - endurecimento de producao

```text
6.1  cookie          ja estava certo; agora provado em producao
6.2  CORS            FRONTEND_ORIGIN ausente caia em localhost - CORRIGIDO
6.3  trust proxy     tinha default; agora obrigatorio e explicito
6.4  erro interno    nao vazava, mas tambem nao registrava - CORRIGIDO
6.5  HTTPS           decidido e documentado; nenhum redirect no backend
6.6  estaticos       ja estava certo; agora provado
6.7  /api/health     versao duplicada e provedor de IA exposto - CORRIGIDO
6.8  migrations      rodam no build; documentado
6.9  variaveis       quatro obrigatorias recusam subir - NOVO
```

#### O defeito mais serio: `FRONTEND_ORIGIN` caia em localhost

Ate a v0.7.4, `FRONTEND_ORIGIN` ausente virava `http://localhost:5173` tambem
em producao. O backend anunciava em CORS, com `credentials: true`, que confiava
numa origem local. Ninguem via, porque o app funcionava: frontend e API estao na
mesma origem e nao precisam de CORS.

Agora o default de localhost so existe fora de producao. Em producao, falta a
variavel e o processo nao sobe.

O CORS **nunca refletiu a origem do request**: o pacote `cors` com origem fixa
devolve sempre a configurada. Isso foi medido, mandando `Origin` de um atacante,
e nao assumido. A configuracao sem origem passou a ser `false` explicito, para
que a seguranca nao dependa de como a biblioteca trata string vazia.

#### Quatro variaveis obrigatorias recusam subir

Com `NODE_ENV=production`, `backend/src/server.js` confere a configuracao
**antes de abrir a porta**:

```text
DATABASE_URL     sem ela, conta, perfil, historico e favoritos dariam 503
DATABASE_SSL     um default false mandaria a senha do banco sem TLS
FRONTEND_ORIGIN  o default de localhost descrito acima
TRUST_PROXY      errado, o teto por IP vira teto global, ou o cliente escolhe o
                 proprio IP
```

A regra comum as quatro: a falta seria silenciosa. Booleano que nao e
`true`/`false` tambem recusa - um `TRUE_` digitado errado nao cai no default. A
mensagem diz qual variavel e por que, **nunca o valor de nenhuma**.

`FRONTEND_ORIGIN` em producao precisa ser `https://` e so a origem.

`ANTHROPIC_API_KEY` continua opcional, por decisao de produto: sem ela o
assistente responde localmente e o health diz `ai: not_configured`. A falta e
visivel.

**`SESSION_SECRET` nao existe neste projeto.** A sessao e um token aleatorio
guardado no banco so como hash SHA-256; nao ha cookie assinado.

#### Erro interno: o cliente nao ve, e agora o operador ve

O handler de erro ja omitia o detalhe em producao. Mas o erro era descartado: um
500 sumia sem rastro, nem no log. Agora o detalhe vai para o log do servidor,
que e onde ele serve, e o cliente continua recebendo so `INTERNAL_ERROR` e uma
frase generica.

O teste derruba o banco de verdade - conexao recusada - e confere que nem a
mensagem do driver, nem host, nem porta, nem stack chegam a resposta.

#### `/api/health`: uma fonte de versao, e sem nome de fornecedor

A versao era um literal em `env.js`, repetido em quatro arquivos e atualizado a
mao a cada versao - e o caminho pelo qual o R3 aconteceu. Agora `env.js` le
`backend/package.json`, e o health devolve esse valor.

O campo `aiProvider: "anthropic"` saiu. O `CLAUDE.md` do projeto determina que o
frontend nunca sabe qual provedor respondeu, e o health e API publica. Nenhum
consumidor dependia do campo.

O health expoe `status`, `database`, `ai` e `version`, e so isso. O teste exige
exatamente essas quatro chaves.

#### HTTPS, cookie e migrations: decisoes registradas

O detalhe, com o motivo de cada uma, esta em `docs/DEPLOY.md`.

```text
HTTPS       redirect no proxy do Render, HSTS de 1 ano pelo backend. Um redirect
            no backend derrubaria o health check interno.
cookie      HttpOnly, Secure, SameSite=Lax. Lax funciona porque frontend e API
            estao na mesma origem.
migrations  no build. Migration que falha impede a publicacao, e o Render mantem
            a versao anterior no ar.
```

Uma armadilha documentada para o futuro: `onrender.com` esta na Public Suffix
List. Separar frontend e API em dois servicos do Render os tornaria sites
diferentes, e o cookie Lax deixaria de ir junto.

### Entrega B - `npm run verify:deploy`

```bash
npm run verify:deploy -- https://nutriscan-h1wp.onrender.com
```

```text
D1  versao no ar IGUAL a do repositorio - o R3 virando gate
D2  HTTPS, e http:// redireciona para https://
D3  HSTS, CSP e nosniff
D4  rota /api inexistente da 404 em JSON, nao o index.html
D5  quatro rotas autenticadas dao 401 sem sessao
D6  erro provocado nao vaza stack, SQL, tabela nem caminho
D7  o HTML e servido, e cada script e estilo que ele cita carrega
D8  nenhuma chave nem string de conexao no HTML ou nos bundles
```

A comparacao de versao e por igualdade estrita: `0.7.50`, `v0.7.5`,
`0.7.5-rc1` e `0.7.5 ` com espaco reprovam. Sem URL, o comando falha e diz como
informar - nunca assume localhost. Exit 0 so com os oito em PASS;
`NOT_EXECUTED` nao conta como aprovacao.

**O comando so le.** Nao cria conta, nao grava, nao chama a IA. A unica
requisicao fora de GET e o D6: JSON quebrado para um caminho que nao e rota de
nada. O teste roda o comando contra o roteador real, com um espiao contando
cada requisicao, e exige que nenhuma rota de escrita seja alcancada.

E separado do `verify:e2e`, que continua provando o backend local.

### O que a mutacao encontrou

Doze mutantes novos na primeira rodada. Onze morreram; **um sobreviveu**:

```text
T8  NOT_EXECUTED passa a contar como aprovacao no agregado   SOBREVIVEU
```

O teste do agregado so exercitava o fluxo real, em que o D8 fica `NOT_EXECUTED`
apenas quando o D7 ja falhou. Esse FAIL do D7 reprovava o agregado de qualquer
jeito, e escondia uma regra frouxa. A regra foi separada numa funcao e testada
sozinha, com sete PASS e um NOT_EXECUTED. Na rodada seguinte, o T8 morreu.

Ao revisar o P11, faltava tambem um teste do **codigo de saida** do processo -
os outros olhavam o agregado em memoria. Acrescentado, com o mutante `T9`
(exit 0 mesmo com subgate reprovado).

### O script de mutacao aprovava com o banco fora do ar

O achado mais serio desta versao e sobre a propria ferramenta de prova.

Tres rodadas de mutacao desta versao rodaram com o **PostgreSQL local
parado** - ele tinha caido em 20/09 e ninguem percebeu. Todo mutante de banco
"morreu": os testes nomeados ficavam vermelhos por conexao recusada, nao pelo
defeito injetado. O script reportou `mortas 49 | problemas 0 | APROVADO`.

A causa: `mutation-check.js` aceitava QUALQUER falha do teste nomeado como
prova, e nunca conferia que esse teste passava sem a mutacao.

Corrigido com uma **linha de base**. Antes da primeira mutacao e depois da
ultima, cada suite roda sem defeito, e cada teste que precisa quebrar tem de ter
PASSADO - nao pulado, nao ausente. Com a base inicial vermelha, nenhuma mutacao
e aplicada; com a final vermelha, a rodada inteira e reprovada.

A guarda foi provada reproduzindo a situacao: banco parado de proposito, e a
rodada parou antes de mutar, nomeando os oito testes que nao podiam servir de
prova. Os mutantes de banco foram revalidados com o banco de pe.

As rodadas das versoes anteriores nao sao afetadas: o log do PostgreSQL mostra
o banco ativo durante elas.

### O secret scan pegou uma isca de teste

O `verify:release` reprovou uma vez nesta versao: `backend/tests/verifyDeploy.test.js`
tinha, como literal, uma chave falsa com a forma de chave Anthropic - a isca que
prova que o D8 pega chave num bundle. O scan estava certo em reprovar. O gate
nao foi tocado; a isca passou a ser montada por partes em tempo de execucao.

### Antes de publicar esta versao

**Defina `FRONTEND_ORIGIN=https://nutriscan-h1wp.onrender.com` no painel do
Render antes do push.** A partir desta versao, sem ela o processo nao sobe. O
`render.yaml` declara a variavel com `sync: false`, mas o valor precisa ser
preenchido no painel.

### Observacoes descritas e NAO corrigidas

Fora do escopo das secoes 6 e 7, ficam para decisao:

```text
NODE_ENV com erro de digitacao vira development, em silencio. Um teste
  existente trava esse comportamento de proposito.
JSON malformado devolve 500, e nao 400. Nao vaza nada; so o codigo esta errado.
env.test.js sobrescreve o backend/.env real durante o teste e o restaura
  depois. Uma execucao interrompida no meio deixaria o arquivo trocado.
Janela de migration: entre o fim do build e a troca de versao, o codigo antigo
  serve contra o schema novo.
```

## NutriScan v0.7.4 - 2026-09-20

Correcao do defeito N1 e documentacao da observacao N2, da auditoria externa da
v0.7.3.

### N1 - a normalizacao que o codigo documentava e nao aplicava

`shared/barcode.js` explicava, por escrito, por que a normalizacao de UPC-A
existia:

```text
"Sem normalizar, o mesmo produto lido pela camera como EAN-13 e digitado pela
 pessoa como UPC-A viraria DUAS linhas de historico, e favoritar por um caminho
 nao apareceria como favoritado pelo outro."
```

**Esse defeito acontecia.** O auditor externo subiu o app e mediu:

```text
grava via camera (EAN-13)    code=0036000291452  -> 201
grava via digitado (UPC-A)   code=036000291452   -> 201

HISTORICO -> 2 linhas:
    036000291452  | Duracell AA
    0036000291452 | Duracell AA

favoritos: ["0036000291452"]
UPC-A digitado aparece como favoritado? NAO
```

A medicao foi reproduzida nesta versao antes de qualquer correcao, com o mesmo
resultado.

#### Causa

`productCodeSchema` usava `exigeDigitoVerificador` e `digitoVerificadorConfere`.
Ele CONFERIA o digito e nunca chamava `validarCodigoDeBarras`, que e a funcao
que devolve a forma canonica. O codigo chegava ao PostgreSQL exatamente como
veio na requisicao.

O frontend normalizava, mas so no caminho manual - condicionado a
`origem === "manual"`. Um UPC-A lido pela CAMERA, ou uma requisicao direta a
API, gravava a forma de 12 digitos.

E a mesma classe de erro do defeito E1 da v0.7.1: um comentario afirmando uma
propriedade que o codigo nao garantia. Da primeira vez a frase era falsa; desta
vez a frase estava certa e o codigo e que nao a cumpria.

#### Correcao

A canonicalizacao passou a acontecer no `.transform()` do `productCodeSchema` -
onde a validacao ja acontecia, e por onde TODO caminho de entrada passa: manual,
camera e requisicao direta.

```text
036000291452   -> 0036000291452   UPC-A canonicalizado
0036000291452  -> 0036000291452   ja canonico
7891000100103  -> 7891000100103   EAN-13, intacto
96385074       -> 96385074        EAN-8, intacto
12345678901234 -> 12345678901234  nao e EAN/UPC, intacto
20003404_0001  -> 20003404_0001   alfanumerico da base, intacto
```

A forma canonica vem de `validarCodigoDeBarras`, em `shared/barcode.js`. Nao ha
segunda implementacao: escrever "prefixa um zero" no backend seria a copia que
diverge depois.

**O que o banco guarda e o que o backend canonicalizou.** A normalizacao do
cliente continua existindo, por conveniencia de exibicao, mas nao e mais a que
decide.

#### Por que a isencao para codigo nao-EAN permanece

A base da Open Food Facts tem cadastros alfanumericos, e a camera le ITF-14 e
CODE_128. Canonicalizar esses seria inventar um codigo que nao existe, e exigir
digito verificador deles seria perda de funcionalidade vendida como seguranca.
A isencao foi confirmada correta pelo auditor e nao foi tocada.

#### Por que escapou aos testes

Os testes da v0.7.3 exercitavam `validarCodigoDeBarras` isoladamente e a
gravacao com EAN-13. **Nenhum atravessava os dois formatos ate o banco.** Os
testes novos gravam de verdade e leem de volta - inclusive por requisicao direta,
sem passar pelo frontend.

### Dados ja existentes: migration 003

Escolhida a opcao (a) do prompt: migration que canonicaliza as linhas gravadas
antes.

O motivo de nao escolher (b): producao esta hoje com zero linhas nas duas
tabelas, mas o banco do proprio auditor tem as duplicatas, e qualquer instalacao
que usou da v0.7.0 a v0.7.3 pode ter. Sem migrar, o usuario veria o mesmo produto
duas vezes no historico, para sempre, sem saber por que.

#### A regra de sobrevivencia, escrita na propria migration

Quando o usuario ja tem as DUAS formas do mesmo produto - foi exatamente o que o
auditor produziu -, canonicalizar violaria `(user_id, product_code)`.

```text
A LINHA CANONICA SOBREVIVE.
A nao canonica e removida, depois de doar o que tem de mais recente.
```

O motivo: a canonica e a que vai continuar recebendo escrita daqui em diante.
Manter a outra significaria apagar justamente a que o app vai usar.

```text
product_history    fica com o `viewed_at` mais recente das duas, e com nome,
                   marca e imagem da linha mais recente. E a mesma regra que o
                   `ON CONFLICT DO UPDATE` ja usa em escrita normal.

product_favorites  fica com o `created_at` mais ANTIGO. Favoritar e ato
                   intencional, e a data que interessa e desde quando o produto
                   e favorito - nao a da duplicata acidental.
```

Nenhuma linha e apagada fora dessa regra. Codigo de 12 digitos com digito
verificador invalido nao e UPC-A e nao e tocado: ele pode ter entrado antes de a
v0.7.3 conferir o digito, e inventar canonico para ele seria pior.

A migration e idempotente pelo mesmo mecanismo das outras - registro em
`schema_migrations` - e o teste aplica duas vezes para confirmar.

#### O runner passou a aceitar migration em JavaScript

Decidir se um codigo de 12 digitos e um UPC-A de verdade depende do digito
verificador. Escrever esse calculo em SQL seria a segunda implementacao que o
proprio prompt proibe. `backend/scripts/migrate.js` passou a aplicar `.js` alem
de `.sql`, na mesma ordem de nome e com o mesmo registro.

### Nove testes estavam escondidos dentro de outro

Ao conferir a contagem com e sem a flag de banco, os numeros nao bateram: 32
testes com ela, 23 sem. Teste pulado continua sendo contado, entao a diferenca
significava que nove nao estavam sequer sendo registrados.

Ao inserir os testes `N1a` a `N1g` no arquivo, um `});` foi consumido e os nove
ficaram **aninhados dentro do teste `M11`**. Com banco, `M11` executava e os
nove rodavam como subtestes - passavam, e a mutacao os matava. Sem banco, `M11`
era pulado e os nove sumiam sem deixar rastro.

Um pai pulado escondia nove testes em silencio, e a unica pista era a diferenca
de total entre duas execucoes. Corrigido; a validacao por mutacao foi
reexecutada depois.

### N2 - unicidade de nome de usuario, documentada

Registrar com o mesmo nome e e-mail diferente devolve `409 ACCOUNT_EXISTS`. A
regra era intencional e nao estava documentada; o auditor descobriu por
acidente.

**Consequencia pratica: duas pessoas chamadas "Joao Silva" nao conseguem ter
conta.**

Agora esta em `docs/API.md`, no README e em comentario no proprio
`authService.js`. **O comportamento NAO foi alterado nesta versao**, conforme o
prompt pediu.

A avaliacao, para decisao: a unicidade de nome **nao e arbitraria** - ela
sustenta o login. `loginUser` aceita e-mail ou nome como identificador, e a
consulta termina em `LIMIT 1`. Com nomes repetidos, entrar por nome escolheria
uma conta qualquer entre as homonimas, o que e defeito de autenticacao. Retirar
a unicidade de nome exige antes retirar o login por nome; as duas andam juntas.

Sobre a mensagem nao dizer qual campo colidiu: o efeito e limitar enumeracao de
contas - quem recebe `409` sabe que um dos dois existe, mas nao qual. **Nao ha
registro de que essa tenha sido a intencao original**, nem em comentario nem em
CHANGELOG. O comentario acrescentado documenta o motivo de manter, e diz
explicitamente que nao comprova intencao.

## NutriScan v0.7.3 - 2026-09-20

Entrada manual de codigo de barras, com conferencia de digito verificador.

### O problema: a camera era o unico caminho

Ate esta versao, consultar um produto exigia camera. Se a permissao fosse
negada, o aparelho nao tivesse camera, o navegador nao suportasse, a luz fosse
ruim ou a embalagem estivesse amassada, a pessoa travava. Nao havia plano B.

O segundo motivo e menos visivel e mais grave: **o caminho principal do produto
nunca tinha sido exercitado por teste.** A logica do scanner entregue na v0.6.9
- erro transitorio que nao mata a camera, confirmacao por leitura dupla,
resolucao, foco continuo, lanterna - continuava DECLARADA e NAO PROVADA, porque
nao ha camera no ambiente de execucao nem aqui nem no do auditor. E a consulta
em si vivia dentro de um `useCallback` de `App.jsx`, onde nenhum teste alcanca
sem montar React.

A entrada manual resolve as duas coisas: da um caminho alternativo a quem
precisa, e torna o fluxo de consulta auditavel de ponta a ponta pela primeira
vez.

**A atestacao da camera em hardware real continua ABERTA.** Esta versao nao a
fecha e nao afirma ter fechado.

### A conferencia de digito verificador e controle de seguranca

Num app de alergia, um digito digitado errado nao devolve "produto nao
encontrado". Devolve OUTRO PRODUTO - que existe, tem foto, tem nome plausivel e
tem outros alergenicos. A tela fica com cara de acerto e o conteudo errado.

`shared/barcode.js` aceita EAN-13, EAN-8 e UPC-A, e confere o digito
verificador **antes de qualquer requisicao de rede**. Consultar primeiro e
decidir depois ja seria tarde.

O que a conferencia pega, medido: para cada um dos cinco codigos de referencia,
**todas** as trocas de um unico digito - 10 posicoes vezes 9 valores, em cada
codigo - sao detectadas.

O que ela NAO pega, e esta escrito no teste: trocar o ultimo digito e
recalcular produz outro codigo VALIDO. Dois produtos diferentes podem estar a
uma tecla de distancia. Por isso o codigo entregue a busca e exatamente o que a
pessoa digitou, nunca um "corrigido", e a interface continua mostrando nome e
marca para ela conferir. Nao existe "voce quis dizer".

#### As mensagens nao podem ser a mesma

```text
digito verificador errado  ->  "Esse código não existe. Confira número por
                               número na embalagem."
produto ausente da base    ->  "Produto <codigo> não está cadastrado na Open
                               Food Facts."
```

A primeira manda conferir o que foi digitado; a segunda diz que o codigo esta
certo e o produto e que nao esta la. Colapsar as duas manda a pessoa procurar
no lugar errado.

#### UPC-A vira EAN-13, e o motivo e nosso

Um UPC-A de 12 digitos e normalizado para EAN-13 com zero a esquerda. O digito
verificador nao muda, porque o zero nao altera a soma ponderada.

A razao nao e a Open Food Facts: e a deduplicacao. Historico e favoritos usam a
restricao de unicidade `(user_id, product_code)`. Sem normalizar, o mesmo
produto lido pela camera como EAN-13 e digitado como UPC-A viraria DUAS linhas
de historico, e favoritar por um caminho nao apareceria como favoritado pelo
outro.

#### A limpeza e visivel

Espaco e traco sao removidos, porque e assim que a pessoa copia um codigo de
uma embalagem. **Nada alem disso.** A interface mostra "Vou buscar 7891000100103"
antes do envio, e qualquer outro caractere e recusado em vez de apagado em
silencio - apagar mudaria o codigo sem ela perceber, que e o defeito que a
conferencia existe para evitar.

### A validacao do backend tambem, e ela e que vale

`productCodeSchema` passou a usar a MESMA funcao de `shared/barcode.js`. Um
cliente que nao seja o nosso - ou o nosso com defeito - nao grava codigo
numerico de 8, 12 ou 13 digitos com digito verificador errado.

A regra e deliberadamente ESTREITA. A base da Open Food Facts tem codigos
alfanumericos, e o scanner le ITF e CODE_128, que nao tem digito verificador de
EAN. Exigir de todos transformaria um controle de seguranca em perda de
funcionalidade. So se exige quando o codigo e todo numerico E tem um dos tres
tamanhos de EAN/UPC - ali, digito errado nao tem explicacao inocente.

### Um caminho de consulta so

O codigo digitado entra no mesmo fluxo do escaneado:

```text
codigo -> consultarProdutoPorCodigo -> motor deterministico -> allergyVerdict -> UI
```

`services/productLookup.js` e esse caminho. `App.jsx`, o gate E2E e os testes
chamam a MESMA funcao. Extrair nao criou um caminho paralelo: nomeou o unico
caminho, que antes estava escondido dentro de um componente.

**O que difere entre as origens e so a conferencia de ENTRADA, e por um motivo
concreto.** O scanner le EAN-13, EAN-8, UPC-A, UPC-E, ITF e CODE_128. Desses,
ITF e CODE_128 nao tem digito verificador de EAN - ITF-14 tem 14 digitos e
CODE_128 aceita letra. Exigir digito verificador de EAN na saida da camera
recusaria caixa de papelao e etiqueta de balanca, que sao leituras legitimas.

E nao faria falta: a propria `@zxing` confere o checksum da simbologia ao
decodificar e lanca `ChecksumException` quando ele nao bate - e por isso esse
erro ja estava na lista de transitorios do `scannerService`. Uma leitura de EAN
que chega ao nosso codigo JA passou pelo digito verificador.

Digitar nao tem essa protecao. Dai a conferencia existir exatamente ali.

### Interface

O campo fica **sempre visivel** na tela da camera, e nao apenas quando ela
falha: digitar costuma ser mais rapido que enquadrar uma embalagem amassada, e
funciona sem permissao nenhuma.

```text
inputMode="numeric"   teclado numerico no celular
pattern               so numero, espaco e traco
<label> associado     leitor de tela anuncia o campo
aria-describedby      dica, aviso de normalizacao e erro ligados ao campo
role="alert"          a recusa e anunciada assim que aparece
aria-invalid          o campo se declara invalido
```

### Rate limit da rota de produto: ela nao existe

O prompt pedia para identificar qual limitador cobre a rota de consulta de
produto. **Nenhum, porque a rota nao existe.**

A consulta sai do navegador direto para a Open Food Facts
(`src/services/openFoodFactsService.js`); ela nao passa pelo nosso backend. Os
limitadores cobrem `/api/auth`, `/api/assistant` e as rotas de colecoes - e a
gravacao de historico e favoritos, que e o efeito persistente de uma consulta,
esta coberta pelos dois tetos da v0.7.2 (300 por usuario e 3000 por IP).

Criar um proxy de produto no backend teria consequencias que vao muito alem
desta versao - CSP, cache, comportamento offline, custo de banda - e por isso
fica DESCRITO no AUDIT_REPORT, nao implementado.

Nenhum teto existente foi afrouxado e nenhum bypass foi introduzido.

## NutriScan v0.7.2 - 2026-09-20

Correcao do defeito E1 da auditoria externa da v0.7.1, mais a disciplina de
escopo cobrada em E2.

### E1 - a chave por usuario tinha ELIMINADO o teto por IP

A v0.7.1 trocou a chave do limitador de colecoes de IP para usuario da sessao, e
o comentario que ficou no codigo dizia:

```text
"Isso conserta o harness sem afrouxar nada"
```

**A frase era falsa.** `requireAuth` roda antes do limitador, entao toda
requisicao que chega ali ja tem sessao e o ramo de IP nunca executava. O teto
por usuario nao somou ao teto por IP: substituiu.

O auditor externo subiu o app e mediu, criando contas do mesmo endereco:

```text
conta 0: 300 requisicoes aceitas, 429 na 301
conta 1: 300 requisicoes aceitas, 429 na 301
conta 2: 300 requisicoes aceitas, 429 na 301
conta 3: 300 requisicoes aceitas, 429 na 301

MESMO IP -> 4 contas, 1200 requisicoes de colecoes aceitas
```

A medicao foi reproduzida nesta versao antes de qualquer correcao, com o mesmo
resultado. Com `authRateLimit` permitindo 40 registros por 15 minutos, um unico
endereco podia criar cerca de 160 contas por hora: o teto pratico saiu de 1.800
para cerca de 48.000 requisicoes por hora, fator 26.

Nao houve vazamento entre contas nem quebra de isolamento, e o armazenamento por
conta continuou limitado. E degradacao de disponibilidade, nao de
confidencialidade.

#### A correcao: os dois tetos coexistem

```text
teto por usuario   300 por 10 minutos   (inalterado)
teto por IP       3000 por 10 minutos   (novo)
```

Os dois limitadores rodam em sequencia; passar exige caber nos dois, e qualquer
um recusando termina em 429.

**A ordem importa e nao e estilo.** O teto por usuario e conferido PRIMEIRO. Com
o de IP na frente, a requisicao 301 de um usuario abusivo passaria pelo contador
de IP - incrementando-o - para so entao ser recusada pelo contador de usuario. O
abusivo gastaria orcamento compartilhado com requisicoes que nem foram
atendidas, punindo os vizinhos de NAT. Conferindo o usuario primeiro, a recusa
acontece antes de tocar no contador de IP.

Depois da correcao, 12 contas do mesmo endereco:

```text
contas 0 a 9:  300 requisicoes aceitas cada, 429 na 301
conta 10:      0 aceitas, 429 na PRIMEIRA requisicao
conta 11:      0 aceitas, 429 na PRIMEIRA requisicao

TOTAL: 3000, exatamente o teto por IP
```

#### De onde vem o numero 3000

Medido, nao estimado:

```text
suite de integracao de colecoes   372 requisicoes de um unico IP
scripts/e2e-real.js                 9 requisicoes
```

Os 372 explicam por que o teto de 300 por IP da v0.7.0 quebrava nove testes: a
suite inteira roda de `127.0.0.1`, na mesma janela, e o contador do limitador
sobrevive aos servidores que cada teste sobe e derruba.

A restricao que manda, porem, nao e o teste - e o caso NAT/CGNAT, que foi o
motivo de existir o teto por usuario. Uso intenso de verdade gira em torno de 60
requisicoes de colecoes por 10 minutos por pessoa. 3000 acomoda cerca de 50
pessoas nesse ritmo atras do mesmo endereco, ou 10 pessoas gastando a cota
individual inteira. Um teto perto de 300 puniria exatamente quem a v0.7.1
quis proteger.

A folga sobre a maior medicao e de **8,06x** (3000 / 372). Ela e generosa de
proposito: o teto por IP e rede de contencao contra abuso de multiplas contas,
nao o controle primario, e voltar a quebrar a suite de integracao seria repetir
D1. A suite agora confere essa folga sozinha, em `R11`, e avisa com uma mensagem
explicativa se um teste novo empurrar a conta para perto do limite.

#### IPv6: um bloco /64 e um balde so

Quem recebe um `/64` da operadora tem 2^64 enderecos. Sem normalizar, trocar de
endereco a cada requisicao daria um balde novo toda vez e o teto por IP viraria
enfeite. A chave de IP usa o prefixo `/64`, que e a unidade que a operadora
entrega. IPv4, e IPv6 mapeando IPv4, usam o endereco inteiro.

#### `trust proxy` conferido, nao presumido

Com `trust proxy: 1`, `req.ip` e sempre o ultimo valor de `X-Forwarded-For` - o
que o proxy do Render acrescenta. Medido nesta versao: um cliente que prefixa
`9.9.9.9, 8.8.8.8` antes do valor real continua sendo identificado pelo valor
real. O cliente nao escolhe o proprio balde, e o teto por IP nao vira teto
global.

#### Nenhum bypass

A decisao da v0.7.1 continua valendo e nao foi mexida: nenhuma variavel de
ambiente, cabecalho, query string ou cookie desliga qualquer um dos dois
limitadores.

### E2 - entrada retroativa: artefatos entregues sem declaracao

O auditor apontou que a v0.7.1 entregou cinco artefatos fora do escopo declarado
(que era D1 + D2), e que ele os audita sem saber que existem. Nenhum e risco e a
suite passa com todos, mas eles nunca foram nomeados em CHANGELOG. Ficam
registrados agora:

```text
src/components/allergies/AllergyPicker.jsx   commit 641aa5f
src/styles-v070.css                          commit 641aa5f
public/nutriscan-icon.svg                    commit 641aa5f
public/nutriscan-logo.png                    commit 641aa5f
scripts/pack-release.ps1                     commit 7b19c6e
```

Os quatro primeiros vieram juntos, no commit que aplicou o pacote de design
enviado pelo dono do projeto. O pacote trazia `styles.css` e os assets que ele
referencia; `AllergyPicker.jsx` e `styles-v070.css` existem porque o
`styles.css` do pacote entra intacto, por decisao do dono, e quem se ajusta e o
codigo - as regras das telas que o pacote nao cobre vivem em arquivo separado
para nao encostar nele. `nutriscan-icon.svg` e `nutriscan-logo.png` sao os
assets que o pacote referencia.

O quinto, `pack-release.ps1`, entrou no commit da v0.7.1: ate ali o ZIP de
auditoria era montado colando comandos no terminal.

A licao registrada: entrega pedida no meio do caminho continua precisando
aparecer no CHANGELOG da versao que a carrega, mesmo quando o pedido e do dono e
o escopo formal da versao era outro.

### Um teste que vigiava uma constante lendo a propria constante

`Q2` montava o laco com `TETO_COLECOES_POR_USUARIO + 1`. Com a constante mutada
para 100000, o teste nao falhou: saiu fazendo 100001 requisicoes. Um teste que
deriva a expectativa da mesma constante que deveria vigiar nao vigia nada - se
alguem inflar a constante, o teste infla junto e continua verde.

O valor de producao passou a ser escrito a mao no teste, e `R6` e quem confere
que a constante bate com ele. Os dois precisam concordar.

### O script de mutacao podia deixar o defeito no repositorio

`scripts/mutation-check.js` confiava em `process.on("exit")` para desfazer a
mutacao. Uma execucao desta versao foi interrompida de fora, o manipulador nao
rodou, e a arvore ficou com `TETO_COLECOES_POR_USUARIO = 100000` - o limitador
de producao praticamente desligado - ate a conferencia seguinte.

O conteudo original agora vai para um jornal em disco ANTES da mutacao. Se o
processo morrer, a proxima execucao comeca desfazendo o estrago e avisa. Um
script que injeta defeitos de proposito nao pode depender de sair com educacao.


## NutriScan v0.7.1 - 2026-09-20

Correcao do defeito D1 da auditoria externa da v0.7.0, mais a verificacao do
defeito D2 da mesma auditoria.

### D1 - o limitador de requisicoes contava por IP e impedia a prova de isolamento

O limitador de `/api/history` e `/api/favorites` permite 300 requisicoes por
janela de 10 minutos. Ate esta versao ele contava por endereco IP.

A suite de integracao roda todos os testes contra o mesmo servidor, a partir do
mesmo IP, dentro da mesma janela. F4 sozinho faz 201 requisicoes e H3 faz mais
de 100; somados aos anteriores, o teto de 300 estourava no oitavo teste. Dali em
diante o servidor respondia o texto `Too many requests` e o harness quebrava ao
tentar interpretar aquilo como JSON:

```text
SyntaxError: Unexpected token 'T', "Too many r"... is not valid JSON
```

Nove dos dezoito testes falhavam. Entre eles estavam **I1, I2 e I3 - os testes
de isolamento entre contas**. Sem banco eles ficavam em SKIP; com banco,
falhavam por quota. Nunca tinham rodado com sucesso. A propriedade mais
importante do recurso - que um usuario nao le nem apaga dado de outro - passou
uma versao inteira sem prova.

A chave do limitador passou a ser o id do usuario da sessao, com reserva por IP
para requisicao sem sessao:

```js
export function collectionsRateLimitKey(req) {
  const userId = req?.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req?.ip ?? "desconhecido"}`;
}
```

**Nao foi criado nenhum mecanismo de bypass.** Nenhuma variavel de ambiente,
cabecalho, query string ou cookie desliga o limitador. Um interruptor desses e
uma porta, e uma porta que possa ser aberta em producao troca um defeito de
teste por uma vulnerabilidade. Os tres limites de producao seguem identicos:

```text
auth          40 requisicoes / 15 minutos
assistente    20 requisicoes / 10 minutos
colecoes     300 requisicoes / 10 minutos
```

A correcao tambem melhora a producao por um motivo independente do teste: atras
de NAT corporativo ou CGNAT de operadora - situacao comum no celular, que e onde
este app vive - varios usuarios dividem um IP, e antes um deles sozinho podia
consumir a cota de todos.

Com a correcao, a suite de integracao contra PostgreSQL 17.10 real passou de
`18 testes, 9 falhando` para `18 testes, 18 passando, 0 pulados`.

### O orcamento de requisicoes da suite E2E agora e medido

Corrigir a contagem de colecoes nao resolve auth nem assistente, que continuam
contando por IP e, nessa suite, saem todos do mesmo endereco. A suite E2E passou
a contar o que gasta em cada limitador e a reprovar se ultrapassar metade do
teto - margem, e nao o teto, para que um teste novo nao descubra o limite do
jeito ruim. A execucao desta versao gastou:

```text
auth          3 de 40    (margem 20)
assistente    2 de 20    (margem 10)
colecoes      9 de 300   (margem 150)
```

As requisicoes de colecoes caem todas num balde so de proposito. Separar por
cliente pareceria mais preciso e seria errado: `clientB` faz login com o e-mail
de A, entao dois clientes da suite sao a mesma conta.

### Validacao por mutacao

Um teste que passa nao prova nada sozinho. `scripts/mutation-check.js` injeta
oito defeitos reais no codigo, roda os testes que deveriam pega-los e exige que
fiquem vermelhos. As oito mutacoes foram detectadas.

O script encontrou um problema real durante esta versao: a primeira versao do
teste que proibia o limitador de ler dados do request procurava `req.get` no
codigo-fonte, e a mutacao escreveu `req?.get?.(` com encadeamento opcional. O
defeito passou despercebido. O teste foi refeito como prova de comportamento -
a sessao e sempre a mesma pessoa, e nove tentativas de forjar um balde novo por
cabecalho, cookie e query string continuam recebendo 429.

### Dois testes traziam o numero da versao escrito na mao

`backend/tests/env.test.js` e `backend/tests/http.test.js` afirmavam
`assert.equal(env.version, "0.7.0")`. Como o numero real mora em
`backend/src/config/env.js`, o incremento desta versao quebrou dois testes que
nao tem nada a ver com versao, em arquivos que nenhuma documentacao listava
entre os pontos a atualizar.

O reparo obvio seria trocar o literal, que e o mesmo gesto de mudar um teste
para ele passar - so que aqui parecia legitimo. Os dois passaram a derivar a
versao da fonte unica. `version.test.js` continua sendo quem prova que
manifesto, env e documentacao concordam.

### Empacotamento de auditoria virou script

Ate a v0.7.0 o ZIP era montado colando comandos no terminal. `scripts/pack-release.ps1`
monta, valida o artefato gravado - nenhuma pasta proibida, nenhum `.env`,
nenhum ZIP aninhado, nenhuma barra invertida, arquivos obrigatorios presentes -
e so entao grava o SHA-256. Se a validacao falhar, o ZIP e apagado, porque um
pacote invalido no disco acaba sendo entregue por engano.

A primeira execucao produziu 3586 entradas em vez de 152: a exclusao olhava
apenas o primeiro segmento do caminho, e `backend/node_modules/` comeca com
`backend`. Corrigido para olhar todos os segmentos.

### D2 - verificacao da correcao P2 da v0.6.9

O gate de release executa `npm audit --audit-level=moderate` no frontend e no
backend, confirmado em `scripts/verify-release.js:82-83` e travado por
`backend/tests/auditThreshold.test.js`. As duas execucoes desta versao:

```text
frontend  npm audit --audit-level=moderate  ->  found 0 vulnerabilities  (exit 0)
backend   npm audit --audit-level=moderate  ->  found 0 vulnerabilities  (exit 0)
```

Os tres avisos moderate em `qs` que motivaram P2 nao reaparecem.


## NutriScan v0.7.0 - 2026-09-18

Historico de consultas, favoritos e sincronizacao entre dispositivos, mais
quatro pendencias herdadas da auditoria externa da v0.6.9.

### P1 - o produto volta a se chamar NutriScan

Em 04/09/2026 o produto foi renomeado para "NutriVa" pelo commit `f740658`. Em
18/09/2026 a decisao foi revertida. Nenhuma das duas trocas teve versao propria,
entao o residuo passou despercebido e o ZIP auditado da v0.6.9 saiu com
`nutriva` em `package.json`, em `backend/package.json` e nos dois lockfiles.

A varredura encontrou 87 ocorrencias em 32 arquivos. Todas foram normalizadas,
exceto as do CHANGELOG e as da secao historica do AUDIT_REPORT, que sao registro
do que aconteceu.

Tres identificadores NAO mudaram, de proposito, e nunca mudaram em nenhuma das
trocas:

```text
nutriscan:users             localStorage - trocar faz o app perder as contas locais
nutriscan:guest-allergies   localStorage - trocar apaga as alergias do visitante
nutriscan_session           cookie - trocar desloga todo mundo em producao
```

`backend/tests/productName.test.js` passa a falhar se o nome antigo voltar a
codigo, manifesto, lockfile ou interface, e a exigir que os quatro manifestos
declarem `nutriscan`. As excecoes estao justificadas por escrito no proprio
arquivo.

O nome do banco de desenvolvimento em `docker-compose.yml` e em
`backend/.env.example` tambem voltou para `nutriscan`. Quem tiver um volume
local antigo precisa recria-lo; producao usa Neon e nao e afetada.

### Historico de consultas

Todo produto aberto entra no historico do usuario. A deduplicacao acontece na
restricao de unicidade `(user_id, product_code)` do banco, e nao num SELECT
seguido de INSERT: duas requisicoes simultaneas do mesmo produto passariam as
duas por um SELECT que nao encontra nada, e so o banco resolve isso sem corrida.

Limite de 100 itens. Ao estourar, o mais antigo sai em silencio - o registro e
automatico, e o usuario nunca pediu para guardar o item 101.

### Favoritos

Marcar e desmarcar pelo botao do proprio produto. Unicidade garantida pela
restricao do banco, nao pela aplicacao.

Limite de 200 itens que **nao poda**: estourar devolve `409`
`FAVORITES_LIMIT_REACHED`. Favorito e escolha explicita do usuario, e descartar
a mais antiga para caber a nova apagaria uma decisao dele - o oposto do caso do
historico.

### Sincronizacao

O PostgreSQL e a fonte de verdade. `localStorage` e estado React servem apenas
de cache de leitura do lado do cliente, nunca de fonte.

Conflito de escrita concorrente resolve por **ultima escrita vence, medida pelo
relogio do servidor** (`now()` no `ON CONFLICT DO UPDATE`), nunca por horario
enviado pelo cliente. Nome e marca tambem sao atualizados na revisita, porque a
Open Food Facts corrige cadastro com o tempo e o registro mais novo e o mais
fiel.

### Visitante

Quem nao tem conta guarda historico e favoritos apenas no navegador, em
`src/services/guestCollections.js`. Esse arquivo e separado de
`collectionsService.js` de proposito: uma funcao unica que decidisse sozinha
entre banco e `localStorage` seria o lugar exato onde um visitante acabaria
gravando no servidor por engano.

Nao ha migracao automatica do dado local para a conta no login. Mover dado sem o
usuario pedir e mudanca de contrato, nao detalhe de implementacao.

### O veredito de alergia nunca e congelado

As tabelas novas guardam somente identidade de produto. Nenhuma coluna de
veredito, risco ou alergenico detectado - e ha teste que falha se alguma
aparecer.

O perfil de alergia muda; um veredito guardado no passado vira informacao de
seguranca errada. O veredito e sempre recalculado pelo motor deterministico na
exibicao, com o perfil atual. Esta regra e de seguranca, nao de arquitetura.

### Banco

Migration `002_history_favorites.sql`, idempotente, com chave estrangeira em
cascata, restricao de unicidade `(user_id, product_code)` nas duas tabelas e
indice `(user_id, data DESC)` que serve a consulta real da tela.

### Gate E2E

Tres subgates novos em `buildStrictRequirements`: `historySync`,
`favoritesSync` e `verdictFreshness`. Sao requisitos base, nao condicionais a
flag da Anthropic, porque dependem apenas de PostgreSQL real.

O modo strict passou de 14 para 17 requisitos. `backend/tests/e2eGate.test.js`
ganhou um teste que nomeia os 14 anteriores e prova, um a um, que cada um ainda
reprova sozinho.

### P3 - render.yaml entra no registro, retroativamente

O blueprint de deploy `render.yaml` foi adicionado na v0.6.8 sem aparecer no
CHANGELOG nem no README. O conteudo nao tem risco - as credenciais estao
marcadas `sync: false` e ficam no painel do Render, fora do Git - mas a omissao
e do mesmo tipo do achado M1: o repositorio contendo algo que a documentacao nao
menciona.

O que o blueprint define, registrado agora:

```text
servico    web, runtime node, plano free, nome "nutriscan"
health     /api/health
build      npm ci --include=dev && npm --prefix backend ci && npm run build
           && npm run db:migrate
start      npm start
banco      PostgreSQL no Neon, nao no Render: o plano gratuito do Render expira
           em 90 dias e apaga os dados
segredos   DATABASE_URL e ANTHROPIC_API_KEY com sync: false
```

`--include=dev` no build e obrigatorio: com `NODE_ENV=production` o `npm ci`
descarta devDependencies, e o Vite, que compila o frontend, e devDependency.

### P4 - divergencia entre versao publicada e versao em execucao

Os commits `9622ad8` e `168ae69` foram publicados sob o numero 0.6.8, deixando
`/api/health` anunciando versao que nao correspondia ao codigo em execucao.

`scripts/version-check.js` passa a comparar as duas em um comando:

```bash
npm run version:check -- https://exemplo.onrender.com
```

Ele responde exit 0 quando batem e exit 1 quando divergem. Falha de consulta
tambem e exit 1 - nao conseguir perguntar nao e aprovacao.

Nao roda em CI de proposito: exigir rede em CI transforma indisponibilidade de
terceiro em build vermelho, e o objetivo e conferir um deploy, nao barrar um
commit.

## NutriVa v0.6.9 - 2026-09-18

Versao de interface. Nenhuma regra de alergia, autenticacao ou IA foi tocada: o
motor deterministico, o veredito autoral do servidor e o contrato da API
publica saem identicos da v0.6.8.

Ela fecha duas entregas que ja estavam em producao sem numero proprio - os
commits `9622ad8` e `168ae69` foram publicados sob o numero 0.6.8, o que deixou
o `/api/health` anunciando uma versao que nao correspondia ao que rodava. Esta
entrada existe para encerrar essa divergencia.

### Leitura do codigo de barras

A camera se desligava sozinha ao mirar um produto real. O callback de leitura
tratava qualquer erro diferente de `NotFoundException` como falha fatal e
chamava `stop()`, mas a `@zxing/browser` lanca `ChecksumException` e
`FormatException` o tempo todo enquanto a pessoa enquadra o codigo - borrado,
cortado, com reflexo. A propria biblioteca segue tentando nesses casos; o app
matava a camera no primeiro quadro imperfeito.

```text
erro transitorio    camera continua ligada   (era: desligava)
resolucao           1920x1080 pedida         (era: padrao da camera, ~640x480)
foco                continuo                 (era: o que viesse)
tentativas por seg  10                       (era: 2)
confirmacao         2 leituras iguais        (era: aceita a primeira)
lanterna            botao, quando suportada  (era: inexistente)
```

A confirmacao por leitura dupla custa cerca de 100ms e evita abrir o produto
errado - num app de alergia isso e informacao de seguranca errada na tela.

### Busca de produtos

Medicao contra a API publica da Open Food Facts em 04/09/2026: o endpoint
`/api/v2/search` respondia 503 em cerca de metade das chamadas, e a resposta de
erro nao traz cabecalho CORS, entao no navegador a falha chegava como erro de
CORS. Sem nenhuma retentativa, uma falha virava "nao encontrei".

Os tempos foram calibrados por medicao, nao por estimativa: o endpoint principal
leva ~7,8s para falhar e o reserva responde em ~0,8s. Por isso o principal nao e
insistido - tres tentativas ali passavam de 20s com a tela parada em
"Procurando...".

```text
/api/v2/search    1 tentativa, timeout 5s
/cgi/search.pl    2 tentativas, timeout 5s, espera de 300ms
/api/v3/product   3 tentativas, timeout 8s, esperas de 400ms e 1200ms
```

A consulta por codigo, que e o caminho critico do scanner, mantem retentativa
porque a alternativa e a pessoa escanear o produto de novo.

### Identidade visual DG Nutricao

A logo da DG Nutricao entrou no produto. O NutriVa continua sendo o nome do
aplicativo e a DG assina, com a logo completa no rodape.

Os dois verdes foram medidos nos pixels do arquivo original: oliva `#5a6942` e
salvia `#859372`. A folha de estilo anterior afirmava tirar as cores da logo,
mas usava `--lime: #a8cc3b`, um verde-limao que nao existe no arquivo.

O salvia reprova em contraste para texto (3.27:1 sobre branco), entao ele so
aparece em borda, fundo e desenho. O simbolo da barra e o favicone deixaram de
ser um icone de folha generico do pacote `lucide` e passaram a usar o monograma
da DG, recortado do arquivo da logo.

### Legibilidade

O app nascera numa escala pequena: 51 dos 58 tamanhos de fonte estavam abaixo de
16px, alguns em 11px, espalhados como valores soltos por 1.662 linhas de CSS.
Foram substituidos por tokens `--t-xs` a `--t-2xl`, mais `--touch` para alvo de
toque.

```text
menor texto do app   15px    (era 11px)
texto corrido        20px    (era 15px)
nome do produto      26px    (era 17px)
alvo de toque        48px    (era 36-44px)
entrelinha padrao    1.55    (era o padrao do navegador, ~1.2)
```

Os tres tons de texto foram escurecidos e passaram a marcar 16.9:1, 11.1:1 e
7.6:1 sobre o fundo off-white, contra 12.8:1, 7.2:1 e 4.9:1.

A fonte maior estourou duas caixas, corrigidas aqui: a faixa de alergia da tela
inicial esmagava o icone de 20px para 7px, e em 320px a pagina passou a rolar
para o lado porque coluna de grid nao encolhe abaixo do conteudo minimo e
`<input>` e `<video>` tem largura natural propria.

### Linguagem

Vinte e um textos de tela e dezessete mensagens de estado reescritos, uma ideia
por frase. Mensagem de erro passou a dizer o que fazer, nao o que houve:

```text
antes  "Tabela nutricional nao cadastrada para este produto."
agora  "Sem tabela nutricional. Confira a embalagem."
```

### Dependencias

`npm audit fix` no frontend resolveu um aviso `high` em `browserslist` e um
`moderate` em `baseline-browser-mapping`, ambos dependencia transitiva de build
via `@vitejs/plugin-react`. O aviso era anterior a esta versao e travava o
`verify-release.js`. O build sai com os mesmos hashes de asset depois da troca.

### Testes

Dezenove testes novos, cobrindo o que quebrou:

```text
backend/tests/scannerReliability.test.js       10 testes
backend/tests/openFoodFactsResilience.test.js   9 testes
```

## Renomeacao NutriScan -> NutriVa - 2026-09-04

O produto passou a se chamar NutriVa, seguindo a marca. A troca foi feita em
codigo, documentacao, interface e testes, com tres excecoes deliberadas:

```text
nutriscan:users            localStorage - trocar apaga contas locais ja salvas
nutriscan:guest-allergies  localStorage - trocar apaga as alergias do visitante
nutriscan_session          cookie - trocar desloga todo mundo em producao
```

Nenhum desses nomes aparece na interface. O servico no Render tambem continua
com o nome antigo, porque a URL publica deriva dele; renomear exige acao no
painel e troca o endereco do site.

Junto com a renomeacao, a interface foi redesenhada: barra superior com busca
global, menu lateral de uma coluna no computador, abas fixas no celular, e cor
com significado - verde para marca e acao, vermelho e ambar so para conflito de
alergia.

## NutriVa v0.6.8 - 2026-08-27

Correcao do defeito CRITICO encontrado pela auditoria externa independente da
v0.6.7, mais tres achados menores. A auditoria instalou PostgreSQL real, rodou a
suite inteira contra ele, exercitou a bateria adversarial do gate e escreveu
exploits proprios.

### C1 - CRITICO - a resposta do modelo substituia o veredito deterministico

A regra do projeto diz que o motor deterministico e a autoridade sobre conflito
de alergia. Ate esta versao, essa autoridade existia **apenas como frase no
system prompt**: "O motor deterministico do NutriVa e autoridade para
conflitos de alergia". Instrucao ao modelo nao e garantia - e um pedido que ele
pode ignorar.

`parseStructuredResponse` validava `stop_reason`, JSON e schema Zod e devolvia o
texto e o nivel de risco do modelo sem nenhuma reconciliacao com o
`allergySnapshot`. O exploit da auditoria, reproduzido aqui antes da correcao:

```text
produto  leite em po nos ingredientes, allergens: ["milk"]
perfil   ["milk"]
motor    hasDeclaredConflict: true, detectedConflicts: ["milk"]

modelo   "Este produto NAO contem leite e e totalmente seguro para voce.
          Pode consumir sem preocupacao."   safety: "normal"

entregue exatamente isso, safety "normal", sem veredito e sem correcao
```

Um falso "seguro" para quem tem alergia a leite e risco de saude. Agravante: a
tela do Assistente nao exibia nenhum veredito deterministico, entao o texto do
modelo era o unico sinal de alergenico que o usuario recebia ali.

Correcao estrutural - o veredito virou campo autoral do servidor:

- `shared/allergyVerdict.js` (novo) deriva `allergyVerdict` somente do motor. O
  modelo nao le, nao escreve e nao influencia esse campo.
- `assistantResponseSchema` passou a ser `.strict()`. Se a resposta do modelo
  trouxer qualquer chave fora do contrato - `allergyVerdict` inclusive - a
  resposta inteira e rejeitada com `AI_SCHEMA_INVALID`, em vez de a chave ser
  descartada em silencio. Fail-closed, como o resto do app.
- `applyAllergyAuthority` remove qualquer `allergyVerdict` vindo do modelo e
  escreve o do motor. Duas barreiras independentes para a mesma garantia.
- PISO DE RISCO: com conflito declarado, `safety` nunca sai como `normal`. O
  servidor eleva para `caution` no minimo, por codigo. `urgent` nao e rebaixado.
- Alerta em texto escrito pelo servidor, separado de `answer`, que nao passa
  pelo modelo.
- `finalizeAssistantResponse` e o ponto unico de saida do endpoint. As respostas
  locais de protecao (urgencia, fora de escopo, tentativa de injecao) passam por
  ele tambem, entao a invariante vale para toda resposta: nenhuma com conflito
  declarado sai como `normal`, venha da IA ou nao.
- Tentativa de minimizacao (conflito declarado + modelo respondendo `normal`)
  vira contador e log estruturado, sem mensagem, sem identificador de usuario e
  sem chave. Nao derruba a requisicao; o piso ja corrigiu a resposta.
- `src/components/assistant/AllergyVerdict.jsx` (novo) mostra o bloco
  deterministico ACIMA do texto do modelo em `AssistantPage`. O estado exibido
  vem sempre de `verdict.status`; a interface nunca infere conflito do texto.
- Sem backend, o frontend calcula o mesmo veredito com o motor compartilhado. O
  alerta de alergia nao depende de IA nem de rede.

Traco declarado aparece no veredito com `status: "traces"` e alerta proprio, mas
nao muda o nivel de risco: `traces` significa "pode conter", e trata-lo como
evidencia declarada esvaziaria o sentido do piso.

### M1 - E2E_REPORT com numeros da versao anterior

O E2E_REPORT da v0.6.7 era o relatorio da v0.6.6 com o titulo trocado: declarava
79 testes (total da versao anterior, sem os 5 de `productionServing.test.js`) e
data 2026-08-15, enquanto o CHANGELOG da propria versao dizia 2026-08-16.

- Relatorio regenerado a partir de execucao real.
- `backend/tests/reportConsistency.test.js` (novo) falha quando a data declarada
  no E2E_REPORT ou no AUDIT_REPORT diverge da data da entrada do CHANGELOG da
  versao atual, ou quando o corpo do documento traz bloco de resultado de outra
  versao. A escolha por data e versao, em vez da contagem de testes, esta
  justificada no proprio arquivo: um teste que afirma o total da suite da qual
  ele faz parte e um alvo movel que erra sozinho a cada teste novo.

### B1 - artefatos declarados ausentes do ZIP

O CHANGELOG da v0.6.4 declarava `.claude/skills/gauntlet-loop/SKILL.md`,
`.claude/workflows/gauntlet-loop.js` e `CLAUDE.md` como padrao permanente do
projeto, e nenhum dos tres estava no pacote de auditoria.

Duas coisas mudaram desde entao. O dono do projeto proibiu o uso do
gauntlet-loop em 27/08/2026, e o `CLAUDE.md` deixou de descreve-lo como metodo
padrao. Entao:

- `CLAUDE.md` passa a ser incluido no ZIP: ele documenta o metodo de trabalho e
  os gates, e o auditor externo precisa dele para verificar as afirmacoes.
- `.claude/` continua **fora** do pacote, agora de forma declarada: e diretorio
  de configuracao de ferramenta local, nao artefato do produto, e o metodo que
  ele automatizava nao esta mais em uso. As afirmacoes do AUDIT_REPORT desta
  versao nao se apoiam nele.

### B2 - a primeira falha mascarava os demais subgates

Com PostgreSQL real, migrations aplicadas e chave falsa, o relatorio saia com
`database: NOT_EXECUTED` mesmo com o banco acessivel: o runner abortava na
chamada Anthropic do visitante antes de exercitar o banco. Nao gerava falso
PASS, mas custava diagnostico.

- As duas etapas que dependem da Anthropic passaram a ser adiaveis. A falha e
  guardada, as etapas independentes rodam e reportam o proprio estado, e a falha
  e relancada antes de `report.ok = true`.
- `buildStrictRequirements` nao perdeu requisito. `backend/tests/e2eGate.test.js`
  ganhou um teste que trava o conjunto exato de requisitos e prova que cada um,
  sozinho, ainda reprova a execucao.

Resultado medido no mesmo cenario da auditoria (banco real, chave falsa):
`database: EXECUTED`, `auth: PASSED`, `sessionSchema`, `multiDevice`,
`isolation` e `logout` reportados, com `ok: false` e exit diferente de zero.

### Testes

- `backend/tests/allergyVerdict.test.js` (novo): T1 a T6, T8, protecoes locais e
  observabilidade da minimizacao.
- `backend/tests/assistantPageRender.test.js` (novo): T7 renderiza o componente
  REAL do Assistente compilando o JSX com esbuild, e verifica que o alerta
  aparece mesmo quando o texto do modelo diz que o produto e seguro.
- Validacao por mutacao de T1, T2, T3 e T7: os quatro mutantes morreram. Nenhum
  sobrevivente.

## NutriVa v0.6.7 - 2026-08-16

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

## NutriVa v0.6.6 - 2026-08-15

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

## NutriVa v0.6.5 - 2026-08-15

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

## NutriVa v0.6.4 - 2026-08-15

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

## NutriVa v0.6.3 - 2026-08-14

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
- Frontend continua chamando apenas a API do NutriVa e agora trata a origem da
  resposta de forma agnostica: qualquer origem diferente de `local` e Nutri IA.
- Fallback local preservado, incluindo `AI_NOT_CONFIGURED`.
- Testes novos do client: sucesso, timeout, 429, 5xx, JSON invalido, schema
  invalido, stop_reason anormal e leitura de content blocks fora de ordem.

## NutriVa v0.6.2 - 2026-08-14

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

## NutriVa v0.6.1 - 2026-08-13

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

## NutriVa v0.6.0 - 2026-08-13

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

## NutriVa v0.5.3 - 2026-08-13

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

## NutriVa v0.5.2 - 2026-08-13

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

## NutriVa v0.5.1 - 2026-08-13

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

## NutriVa v0.5.0 - 2026-08-13

- Implementado Nutri Assistente com IA generativa via backend.
- Adicionado SDK oficial `openai` no backend.
- Criado endpoint `POST /api/assistant/chat` com autenticacao opcional.
- Integrada OpenAI Responses API com `store: false`.
- Adicionado modelo configuravel por `OPENAI_MODEL`.
- Adicionado timeout e limite de saida configuraveis.
- Adicionado contexto minimo de produto para a IA.
- Adicionado contexto de alergias com fonte oficial no PostgreSQL para usuarios logados.
- Adicionado snapshot deterministico de alergias para a IA explicar, sem substituir o motor do NutriVa.
- Adicionada moderacao da entrada quando OpenAI estiver configurada.
- Adicionados mapeamentos seguros para erros da IA.
- Mantido fallback local baseado em regras quando IA falha ou nao esta configurada.
- Adicionados testes de prompt injection, validacao, contexto, fallback e mock da Responses API.
- Adicionado teste real opcional da OpenAI, desligado por padrao.
- Corrigida condicao residual em que resposta antiga de alergias podia sobrescrever visualmente uma intencao nova.
- Adicionada documentacao `docs/AI_ASSISTANT.md`.

## NutriVa v0.4.1 - 2026-08-13

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

## NutriVa v0.4.0 - 2026-08-13

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
