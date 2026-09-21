# Relatorio de Auditoria - NutriScan v0.7.4

Data: 2026-09-20

## Escopo

Correcao do defeito N1 e documentacao da observacao N2, da auditoria externa da
v0.7.3.

Preservado sem alteracao: a matematica do digito verificador em
`shared/barcode.js`, a isencao para codigos nao-EAN, `shared/allergenEngine.js`,
`shared/allergyVerdict.js`, todo o `backend/src/ai/`, scrypt, sessoes,
`backend/src/middleware/rateLimit.js` e as restricoes de unicidade do banco.
Nenhum teto de limitador alterado. Nenhum bypass.

O comportamento de unicidade de nome (N2) **nao foi alterado**, conforme o
prompt pediu: foi documentado e avaliado.

## A camera continua NAO ATESTADA

Esta versao **nao fecha** a lacuna de atestacao da camera em hardware real, e
nao afirma ter fechado. Nenhum aparelho com camera participou de nenhuma
execucao.

## N1 - a normalizacao que o codigo documentava e nao aplicava

### A1 - reproducao ANTES da correcao

App real contra PostgreSQL 17.10 real:

```text
modulo shared diz canonico de 036000291452 -> 0036000291452

grava via camera (EAN-13)    code=0036000291452  -> 201
grava via digitado (UPC-A)   code=036000291452   -> 201

HISTORICO -> 2 linha(s):
    036000291452  | Duracell AA
    0036000291452 | Duracell AA

favoritos: ["0036000291452"]
UPC-A digitado aparece como favoritado? NAO

N1 PRESENTE: o mesmo produto virou 2 linhas de historico.
O backend gravou o codigo como veio, sem canonicalizar.
```

Resultado identico ao que o auditor mediu.

### A2 - DEPOIS da correcao

```text
grava via camera (EAN-13)    code=0036000291452  -> 201
grava via digitado (UPC-A)   code=036000291452   -> 201

HISTORICO -> 1 linha(s):
    0036000291452 | Duracell AA

N1 CORRIGIDO: uma linha so, na forma canonica EAN-13.
```

### Causa raiz

`productCodeSchema` importava `exigeDigitoVerificador` e
`digitoVerificadorConfere`, e nunca `validarCodigoDeBarras` - que e a funcao que
devolve a forma canonica. O schema CONFERIA o digito e gravava o codigo como
veio na requisicao.

O frontend normalizava, mas apenas no ramo `origem === "manual"` de
`productLookup.js`. Um UPC-A lido pela camera, ou qualquer requisicao direta a
API, gravava a forma de 12 digitos.

**E a mesma classe do defeito E1 da v0.7.1**: um comentario afirmando uma
propriedade que o codigo nao garantia. Na v0.7.1 a frase era falsa; aqui a frase
estava certa e o codigo e que nao a cumpria. A segunda variante e mais dificil
de ver, porque a leitura do comentario nao levanta suspeita.

## Onde a canonicalizacao ficou, e por que nesse ponto

No `.transform()` do `productCodeSchema`, em `backend/src/utils/validation.js`.

```js
function canonicalizarCodigo(valor) {
  if (!exigeDigitoVerificador(valor)) return valor;
  const resultado = validarCodigoDeBarras(valor);
  return resultado.valido ? resultado.codigo : valor;
}
```

O ponto e esse por tres motivos:

```text
passagem unica   todo caminho de entrada - manual, camera, requisicao direta -
                 atravessa `productRefSchema` antes de tocar o banco
ja validava      a conferencia do digito ja morava ali; canonicalizar em outro
                 lugar criaria dois pontos de verdade sobre o mesmo campo
ordem correta    o `.refine` roda ANTES do `.transform`, entao um digito errado
                 e recusado sem nunca ser canonicalizado - canonicalizar antes
                 transformaria "12 digitos errados" em "13 digitos errados"
```

A forma canonica vem de `validarCodigoDeBarras`, em `shared/barcode.js`. Um
teste procura por `` `0${ ``, `"0" +` e `padStart(13` no arquivo do backend, para
que escrever "prefixa um zero" a mao fique vermelho.

### O frontend continua normalizando, e por que nao foi removido

O prompt deixou a decisao em aberto. A normalizacao do cliente foi MANTIDA, como
conveniencia de exibicao: a tela mostra "Vou buscar 0036000291452" antes do
envio, e o codigo canonico e o que vai para a consulta a Open Food Facts - que
nao passa pelo nosso backend e portanto nao teria outra chance de normalizar.

Ela deixou de ser a que decide o que vai ao banco. A hierarquia esta escrita nos
dois lugares: a do cliente e conveniencia, a do servidor e a que vale.

## A3 - decisao sobre dados existentes: 4.2(a), migration

### Medicao antes de decidir

```text
PRODUCAO (Neon)
product_history      total 0 | de 12 digitos 0 | nao canonicos 0 | com colisao 0
product_favorites    total 0 | de 12 digitos 0 | nao canonicos 0 | com colisao 0
```

Producao nao tem nada a migrar hoje. Ainda assim a escolha foi (a).

O motivo: o banco do proprio auditor TEM as duplicatas - ele as produziu -, e
qualquer instalacao que usou da v0.7.0 a v0.7.3 pode ter. Sem migrar, o usuario
veria o mesmo produto duas vezes no historico para sempre, sem nenhuma pista do
porque. "Producao esta vazia hoje" e argumento sobre esta instalacao, nao sobre
o defeito.

### A regra de sobrevivencia

Escrita na propria migration, como o prompt exige:

```text
A LINHA CANONICA SOBREVIVE.
A nao canonica e removida, depois de doar o que tem de mais recente.
```

O motivo: a canonica e a que vai continuar recebendo escrita daqui em diante.
Manter a outra significaria apagar justamente a linha que o app vai usar.

```text
product_history    `viewed_at` mais recente das duas; nome, marca e imagem vem
                   da linha mais recente. E a MESMA regra do
                   `ON CONFLICT DO UPDATE` em escrita normal: vence a ultima
                   escrita, medida pelo relogio do servidor.

product_favorites  `created_at` mais ANTIGO das duas. Favoritar e ato
                   intencional; a data que interessa e desde quando o produto e
                   favorito, nao a da duplicata acidental.
```

### O que a migration NAO toca

```text
codigo de 12 digitos com digito verificador invalido   nao e UPC-A
codigo de 13, 8 ou 14 digitos                          fora do caso
codigo alfanumerico                                    fora do caso
```

Um numero de 12 digitos com digito errado pode ter entrado antes de a v0.7.3
conferir o digito. Inventar canonico para ele seria pior que deixa-lo como esta.

### Idempotencia

Pelo mesmo mecanismo das outras: registro em `schema_migrations`. Aplicada duas
vezes pelo runner:

```text
=== primeira aplicacao ===
003 historico: 0 renomeada(s), 0 fundida(s) | favoritos: 0 renomeada(s), 0 fundida(s)
applied 003_canonicaliza_upca.js

=== segunda aplicacao ===
skip 003_canonicaliza_upca.js
```

E o teste `N1g` chama a funcao diretamente duas vezes, com dados, e exige
resultado identico - porque pular por registro nao prova que a logica e
idempotente.

### Uma mudanca de infraestrutura, declarada

`backend/scripts/migrate.js` passou a aplicar migrations `.js` alem de `.sql`.

Era necessario: decidir se um codigo de 12 digitos e um UPC-A de verdade depende
do digito verificador, e escrever esse calculo em SQL seria a segunda
implementacao que a secao 4.3 do prompt proibe. Uma migration em JavaScript
importa a MESMA funcao compartilhada.

Os dois tipos sao ordenados juntos pelo nome e registrados do mesmo jeito. Fica
declarado aqui por ser mudanca em infraestrutura de banco, ainda que pequena.

## N2 - unicidade de nome de usuario

### O comportamento, documentado

```text
POST /api/auth/register com nome ja existente e e-mail novo
  -> 409 ACCOUNT_EXISTS
  -> "Já existe uma conta com esse e-mail ou usuário."
```

A comparacao usa `name_key`, que e o nome normalizado. "Joao Silva" e
"joao silva" sao o mesmo nome. **Consequencia pratica: duas pessoas com o mesmo
nome nao conseguem ter conta.**

Agora documentado em `docs/API.md`, no README e em comentario no proprio
`backend/src/services/authService.js`. **O comportamento nao foi alterado**,
conforme o prompt pediu.

### A avaliacao pedida: a regra NAO e arbitraria

Fui ler o codigo antes de opinar, e a leitura mudou a resposta.

`loginUser` aceita e-mail **ou** nome como identificador:

```js
const user = await findUserByEmailOrNameKey(identifier, data.identifierKey);
// SELECT * FROM users WHERE email = $1 OR name_key = $2 LIMIT 1
```

Com nomes repetidos, entrar por nome escolheria **uma conta qualquer** entre as
homonimas - a que o `LIMIT 1` pegasse. Isso nao e inconveniencia: e defeito de
autenticacao. A senha de uma pessoa poderia abrir a conta de outra, se as duas
tivessem o mesmo nome e a mesma senha.

Ou seja: **a unicidade de nome sustenta o login por nome.** As duas andam
juntas, e retirar uma exige retirar a outra.

### A alternativa, descrita e NAO implementada

Se o projeto quiser permitir nomes repetidos:

```text
1. login passa a aceitar SOMENTE e-mail
2. `name` vira apelido de exibicao, sem unicidade
3. `name_key` deixa de ter indice unico
4. migration para remover o indice
5. a mensagem de 409 passa a falar so de e-mail
```

E mudanca de contrato de autenticacao, fora do escopo desta versao. Fica para
decisao.

Observacao de produto, sem peso tecnico: um app de consumo com publico de mais
idade tende a ter gente entrando por nome, porque e mais facil de lembrar que o
e-mail. Retirar o login por nome tem custo de usabilidade para esse publico, e
nao so de codigo.

### A mensagem nao diz qual campo colidiu

O efeito e real: quem recebe `409` sabe que um dos dois ja existe, mas nao qual.
Dizer "esse e-mail ja tem conta" permitiria testar uma lista de e-mails e
descobrir quem usa o app.

**Nao ha registro de que isso tenha sido a intencao original** - nem em
comentario, nem em CHANGELOG, nem em mensagem de commit. O comentario
acrescentado documenta o motivo de MANTER, e diz explicitamente que nao
comprova intencao. Inventar uma justificativa retroativa seria pior que a
ausencia dela.

Limite honesto dessa protecao: o `409` ainda revela que **um dos dois** existe.
Quem testar um e-mail com um nome aleatorio improvavel sabe que a colisao foi do
e-mail. A protecao reduz o custo do ataque, nao o elimina. Nao foi alterada
nesta versao.

## A4 - N1a a N1g, R1 a R5

```text
N1a  UPC-A e EAN-13 viram UMA linha canonica          verde (PostgreSQL real)
N1b  favoritar por um formato vale pelo outro         verde (PostgreSQL real)
N1c  requisicao DIRETA grava forma canonica           verde (conferido no banco)
N1d  codigo nao-EAN passa intacto                     verde (schema + banco)
N1e  EAN-13 e EAN-8 inalterados                       verde (schema + banco)
N1f  deduplicacao continua funcionando                verde (PostgreSQL real)
N1g  migration: canonicaliza, funde e e idempotente   verde, 3 testes
R1   as 117 mutacoes de um digito continuam rejeitadas  verde
R2   backend recusa digito errado sem o frontend      verde
R3   regressao C1                                     verde, 12 testes
R4   limitadores da v0.7.2 nos valores declarados     verde
R5   isolamento entre contas (I1, I2, I3)             verde
```

`N1c` confere **no banco**, com `SELECT`, e nao pela resposta da API: a resposta
poderia ecoar o que foi enviado sem que o valor gravado fosse esse.

## A5 - validacao por mutacao

Nove mutantes novos, vinte e sete herdados.

```text
S1   N1a  remove o .transform() do productCodeSchema (o defeito N1)   MORTA
S1b  N1a  canonicaliza so no frontend, atravessando o banco           MORTA
S1c  N1c  sem transform, requisicao direta grava 12 digitos           MORTA
S2   N1e  prefixa zero tambem no EAN-8, nao so no UPC-A               MORTA
S2b  N1d  remove a isencao: todo codigo passa pela canonicalizacao    MORTA
S3   N1g  a migration deixa sobreviver a linha NAO canonica           MORTA
S4   N1g  a migration para de conferir o digito antes de canonicalizar MORTA
S5   R2   o digito verificador do backend passa a aceitar tudo        MORTA
S6   N1   o schema monta a forma canonica por conta propria           MORTA
```

Os quatro mutantes sugeridos pelo prompt estao cobertos: remover o
`.transform()` (S1, S1b, S1c), canonicalizar so no frontend (S1b - ele mede a
diferenca ATRAVESSANDO o banco), canonicalizar tambem nao-EAN (S2b) e
`digitoVerificadorConfere` sempre true (S5, alem do P1 herdado).

### Tres mutantes meus estavam errados, e o que isso revelou

**S2, na primeira versao, mutava codigo inalcancavel.** Ele trocava o ramo
`: valor` de `canonicalizarCodigo` - o fallback que so roda se o `.refine`
deixar passar um codigo invalido, o que nao acontece. Resultado: o mutante foi
pego apenas pela leitura de codigo-fonte, nao pelo teste de comportamento.

Isso e informacao util sobre o codigo: aquele ramo e defensivo e inalcancavel
hoje. Fica declarado. O mutante foi substituido por um alcancavel - prefixar
zero tambem no EAN-8 -, que morre pelo comportamento.

**S3 ficou INAPLICAVEL por indentacao errada na ancora** (seis espacos contra
quatro no arquivo).

**P5b ficou INAPLICAVEL porque esta versao mudou o import que ele ancora**: a
lista ganhou `validarCodigoDeBarras`. A ancora nomeia a lista inteira, entao
precisou ser atualizada.

Nos tres casos o script disse **INAPLICAVEL** ou apontou o teste errado, em vez
de declarar sucesso. E o modo de falhar certo: ele reporta que nao conseguiu
testar, em vez de reportar que testou.

### Um defeito estrutural no proprio arquivo de teste, encontrado e corrigido

Ao conferir a contagem de testes com e sem a flag de banco, os numeros nao
bateram:

```text
COM  RUN_DB_INTEGRATION_TESTS=true   32 testes
SEM  a flag                          23 testes
```

Testes pulados continuam sendo CONTADOS pelo runner, entao uma diferenca de
total significa que nove testes nao estavam sequer sendo registrados.

A causa: ao inserir os testes `N1a` a `N1g` no arquivo, um `});` foi consumido,
e os nove ficaram **aninhados dentro do teste `M11`** em vez de no topo do
arquivo. Com a flag ligada, `M11` executava e os nove se registravam como
subtestes - por isso passavam e por isso a mutacao os matava. Com a flag
desligada, `M11` era pulado, seu callback nunca rodava, e os nove sumiam sem
deixar rastro.

O efeito pratico era grave para auditoria: **um pai pulado escondia nove testes
em silencio**, e a unica pista era a diferenca de total entre duas execucoes.

Corrigido: os nove voltaram ao topo do arquivo. Agora sao 32 testes registrados
nos dois casos - 32 verdes com banco, 32 pulados sem ele. A validacao por
mutacao foi REEXECUTADA depois da correcao, porque o arquivo mudou de estrutura.

## A12 - o gate E2E real

**PASS, exit code 0.**

```text
mode                    strict
manualCodeLookup        PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
ok                      true
```

Saida literal, tabela de subgates e `E2E_LAST_RUN.json` integral estao no
E2E_REPORT desta versao. Nenhum subgate em SKIP ou NOT_EXECUTED.

A migration `003` rodou em producao e reportou `0 renomeada(s), 0 fundida(s)` -
as tabelas estavam vazias. Os zeros sao o resultado correto, e estao registrados
porque silencio nao e prova de que ela rodou.

Residuo no banco apos a execucao: **0** nos seis padroes conferidos, e nenhuma
linha orfa.

## A13 - os 18 requisitos do modo strict

```text
modo strict, com a flag da IA:  18 requisitos
os 17 anteriores a v0.7.3:      todos presentes
manualCodeLookup:               presente, requisito BASE
```

O teste poe cada um em `NOT_EXECUTED` e exige que `findMissingRequirements`
devolva exatamente aquele. Nenhum requisito foi acrescentado nem perdido nesta
versao.

## A7 a A11, A14 a A16

```text
A7   npm run build                     OK
A8   npm --prefix backend test         238 testes, 237 pass, 0 fail, 1 SKIP
A9   suite contra PostgreSQL real      32/32 na suite de colecoes, 0 fail
A10  npm audit --audit-level=moderate  0 vulnerabilidades nos dois pacotes
A11  node scripts/verify-release.js    exit code 0
A14  gasto do gate por balde           colecoes 12, auth 3, assistente 2
A15  residuo NutriVa                   0 em codigo, interface e manifestos
A16  versao 0.7.4 nos 7 pontos         consistente
```

O unico SKIP e a chamada paga da Anthropic num `npm test` comum, que se declara
`NAO EXECUTADO`. **Nao conta como PASS**, e a propriedade que ele cobriria foi
provada no gate.

## O que esta versao NAO prova

```text
camera em hardware real           NAO EXECUTADO - exige aparelho com camera
decodificacao optica              NAO EXECUTADO
Open Food Facts real              NAO EXECUTADO - a busca do gate e injetada
migration 003 com dados reais     NAO EXECUTADO EM PRODUCAO - tabelas vazias
suite de colecoes no Neon         NAO EXECUTADO - por decisao de risco
carga simultanea real             NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA e esta versao nao a fecha.**

Sobre a migration: a logica foi exercitada contra PostgreSQL local, com as duas
formas do mesmo produto presentes na mesma conta - o caso que produz colisao de
unicidade. Em producao ela rodou contra tabelas vazias. Ou seja: a regra de
fusao esta provada por teste, **nao por execucao sobre dado real**. Se o banco
do auditor tiver as duplicatas, essa sera a primeira execucao com dado de
verdade.

### Um ramo inalcancavel, declarado

`canonicalizarCodigo` termina em `resultado.valido ? resultado.codigo : valor`.
O ramo `: valor` **nunca executa hoje**: o `.refine` recusa antes qualquer
codigo de tamanho EAN/UPC com digito invalido. Ele existe como defesa contra uma
reordenacao futura das regras do schema, e esta comentado como tal.

A consequencia para a auditoria: um mutante que ataque esse ramo so e detectavel
por leitura de codigo-fonte, nao por comportamento. Foi exatamente o que
aconteceu com a primeira versao do mutante `S2`, e por isso ele foi
substituido. Fica declarado para que nao pareca cobertura que nao existe.

### Uma observacao herdada, ainda aberta

`cleanBarcode`, usado no caminho da camera, remove caracteres nao numericos.
Um CODE_128 alfanumerico e portanto mutilado antes da busca. E anterior a esta
versao, fora do escopo dela, e continua registrado para decisao.

## Historico de auditorias anteriores

## Auditoria da v0.7.3 - 2026-09-20

## Escopo

Entrada manual de codigo de barras, com conferencia de digito verificador.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, todo o `backend/src/ai/`, autenticacao,
scrypt, sessoes, schema do banco e `backend/src/middleware/rateLimit.js`.
Nenhuma migration nova. Nenhum teto de limitador alterado. Nenhum bypass.

`shared/allergyVerdict.js` nao foi alterado; ele aparece na validacao por
mutacao apenas como ALVO de mutante, e e restaurado depois.

## A camera continua NAO ATESTADA

Esta versao **nao fecha** a lacuna de atestacao da camera em hardware real, e
nao afirma ter fechado. Nenhum aparelho com camera participou de nenhuma
execucao. A logica do scanner entregue na v0.6.9 continua DECLARADA e NAO
PROVADA.

O que esta versao fez a respeito foi indireto: ao tornar o caminho de consulta
executavel fora do navegador, ela permitiu que o fluxo produto -> motor ->
veredito fosse exercitado pela primeira vez. A decodificacao optica, nao.

## Decisao sobre UPC-A

**UPC-A de 12 digitos e normalizado para EAN-13 com zero a esquerda.**

O digito verificador nao muda: o zero a esquerda nao altera a soma ponderada, e
o teste M7 confere isso em vez de assumir.

A justificativa NAO e a Open Food Facts - e a deduplicacao do nosso proprio
banco. Historico e favoritos usam a restricao de unicidade
`(user_id, product_code)`. Sem normalizar:

```text
produto escaneado como EAN-13   0036000291452  -> linha 1
o mesmo produto digitado UPC-A    036000291452  -> linha 2
```

Duas linhas de historico para o mesmo produto, e favoritar por um caminho nao
apareceria como favoritado pelo outro. M10 prova que hoje viram uma linha so.

A forma digitada e preservada no resultado (`codigoDigitado`), para a interface
poder mostrar o que a pessoa escreveu.

## Onde a funcao de validacao ficou

`shared/barcode.js`, junto do motor deterministico.

```text
frontend   src/App.jsx                    import "../shared/barcode.js"
           src/services/productLookup.js  import "../../shared/barcode.js"
           src/pages/Scanner/ScannerPage.jsx
backend    backend/src/utils/validation.js  import "../../../shared/barcode.js"
```

Os dois lados importam por caminho relativo, do mesmo jeito que
`allergenEngine.js` ja era compartilhado. Nao ha build step nem copia.

M9 prova que a implementacao e unica de duas formas: os imports existem, e
nenhum outro arquivo reimplementa o calculo. A segunda parte procura tanto o
nome da funcao quanto a assinatura do algoritmo (`% 10) % 10`), porque copiar
com outro nome seria a forma mais provavel de a divergencia entrar.

Dois mutantes atacam exatamente isso: `P5` da ao frontend uma copia propria, e
`P5b` faz o backend parar de importar a compartilhada. Os dois morrem.

## 6.5 - cobertura de rate limit da rota de produto

**NAO EXISTE rota de consulta de produto no backend.**

Isto nao e uma lacuna de configuracao: e a arquitetura atual. A consulta sai do
navegador direto para a Open Food Facts, em
`src/services/openFoodFactsService.js`. O backend expoe seis grupos de rotas, e
nenhum deles e de produto:

```text
/api/health          sem limitador
/api/assistant/chat  assistantRateLimit   20 / 10 min por IP
/api/auth/register   authRateLimit        40 / 15 min por IP
/api/auth/login      authRateLimit        40 / 15 min por IP
/api/profile         sem limitador proprio, exige sessao
/api/history         collectionsRateLimit 300 por usuario + 3000 por IP
/api/favorites       collectionsRateLimit 300 por usuario + 3000 por IP
```

Portanto: **nenhum limitador cobre a consulta de produto, porque ela nao passa
por nos.** Quem sofre a repeticao e a Open Food Facts, nao o NutriScan.

O que ESTA coberto e o efeito persistente da consulta. Toda consulta que vira
registro passa por `/api/history`, e ali valem os dois tetos da v0.7.2, agora
tambem com a conferencia de digito verificador antes da gravacao.

### Proposta, NAO implementada

Se o projeto quiser cobrir a consulta, o caminho seria um proxy no backend:

```text
GET /api/products/:codigo
  -> valida com shared/barcode.js (fail-closed)
  -> consulta a Open Food Facts do servidor
  -> devolve o produto

limitador composto, no padrao da v0.7.2:
  por usuario   teto a medir
  por IP        teto a medir, obrigatoriamente maior - a rota seria acessivel
                a visitante, e nesse caso o teto por IP e o unico que protege
```

Isso **nao foi implementado**, por tres motivos que valem registro:

```text
escopo      a secao 5 fecha o escopo em "digitar o codigo"; mover a consulta
            para o servidor e outra mudanca, maior que esta versao inteira
efeito      muda CSP, cache, comportamento offline e custo de banda do Render
medicao     o teto teria de vir de medicao, e nao ha trafego real para medir
```

A secao 15 manda descrever em vez de implementar o que estiver fora do escopo.
Fica para decisao do auditor.

## 6.1 - um caminho de consulta so, e onde ele diverge

```text
codigo -> consultarProdutoPorCodigo -> motor deterministico -> allergyVerdict -> UI
```

`src/services/productLookup.js` e esse caminho. `App.jsx`, o gate E2E e os
testes chamam a MESMA funcao.

### A extracao, declarada

Ate a v0.7.2 este passo vivia dentro de um `useCallback` em `App.jsx`. Extrair
para um modulo **nao criou um caminho paralelo**: nomeou o unico caminho, que
antes estava inacessivel a teste porque o projeto nao tem renderizador de React.

Era essa a causa de o caminho principal do produto nunca ter sido exercitado. A
secao 4(b) do prompt aponta exatamente isso como motivo desta versao, entao a
extracao esta dentro do escopo - mas fica declarada aqui, porque e uma mudanca
estrutural em codigo que ja funcionava.

O mutante `P3` ataca isso: faz `App.jsx` montar o resultado por conta propria,
chamando a busca direto. Morre.

### Onde os dois caminhos DIVERGEM, e por que

A conferencia de ENTRADA depende da origem. Isto contraria a leitura literal de
6.1, entao precisa de justificativa explicita.

O scanner aceita seis simbologias:

```text
EAN_13  EAN_8  UPC_A   tem digito verificador de EAN
UPC_E                  tem digito verificador proprio, calculado sobre a forma expandida
ITF                    ITF-14 tem 14 digitos; fora dos tamanhos de EAN
CODE_128               aceita letra
```

Aplicar a conferencia de digitacao a saida da camera recusaria ITF e CODE_128 -
caixa de papelao e etiqueta de balanca, que sao leituras legitimas e ja
funcionavam antes desta versao. Seria uma regressao de funcionalidade vendida
como controle de seguranca.

E nao faria falta: a `@zxing` confere o checksum da simbologia ao decodificar e
lanca `ChecksumException` quando ele nao bate. Esse erro ja estava na lista de
transitorios do `scannerService` desde a v0.6.9. **Uma leitura de EAN que chega
ao nosso codigo ja passou pelo digito verificador.**

Digitar nao tem essa protecao, e e exatamente ali que a conferencia entra.

Depois desse passo, os dois caminhos sao identicos. M4 prova por igualdade
profunda do resultado E do veredito, e um dos casos de M4 prova o contrario
tambem: que a camera continua lendo ITF-14 enquanto o mesmo codigo digitado e
recusado.

## 6.2 - o que a conferencia pega, e o que ela NAO pega

### Pega

Para cada um dos cinco codigos de referencia, M1 percorre **todas** as trocas de
um unico digito - cada posicao, cada valor diferente - e exige que todas sejam
detectadas. Sao 117 mutacoes por EAN-13, e nenhuma passa.

### Nao pega, e isso esta no teste

Trocar o ultimo digito e recalcular produz outro codigo VALIDO:

```text
7891000100103   valido
7891000100111   valido tambem, e e outro produto
```

Dois produtos podem estar a uma tecla de distancia. A validacao reduz a classe
de erro, nao a elimina.

A consequencia de projeto, tambem no teste: **o codigo entregue a busca e
exatamente o que a pessoa digitou**, nunca um corrigido ou aproximado, e a
interface continua mostrando nome e marca para ela conferir. Nao existe "voce
quis dizer" num app de alergia.

### Mensagens distintas

```text
vazio              "Digite o código de barras do produto."
caractere invalido "O código de barras tem só números. Confira o que você digitou."
tamanho errado     "Esse código tem N números. Um código de barras tem 8, 12 ou 13."
digito errado      "Esse código não existe. Confira número por número na embalagem."
fora da base       "Produto <codigo> não está cadastrado na Open Food Facts."
```

M6 exige que os quatro primeiros sejam textos diferentes entre si, e que o de
digito errado NAO contenha "nao encontrado" nem "nao esta cadastrado". O
mutante `P7` colapsa dois deles e morre.

### A limpeza e visivel, e limitada

So espaco e hifen saem, e a quantidade removida volta para quem chamou. A tela
mostra "Vou buscar 7891000100103" antes do envio.

Qualquer outro caractere e RECUSADO, nao removido. O mutante `P8` troca a
expressao de separadores por "tudo que nao e digito" - ou seja, limpeza
silenciosa - e morre em M8.
## A1 - M1 a M14

```text
M1   digito verificador, bateria completa       5 testes, verdes
M2   codigo invalido nao gera requisicao        3 testes, verdes
M3   backend recusa codigo invalido             3 testes, verdes
M4   paridade entre os dois caminhos            4 testes, verdes
M5   conflito com piso de risco, via digitacao  3 testes, verdes
M6   mensagens distintas                        3 testes, verdes
M7   UPC-A normalizado preserva identidade      1 teste, verde
M8   normalizacao visivel e limitada            2 testes, verdes
M9   uma implementacao so, em shared/           2 testes, verdes
M10  historico com deduplicacao e limite        3 testes, verdes (PostgreSQL real)
M11  visitante nao grava no PostgreSQL          1 teste, verde (PostgreSQL real)
M12  acessibilidade do campo                    2 testes, verdes
M13  regressao C1                               12 testes, verdes
M14  regressao de limitadores                   17 testes, verdes
```

Arquivos: `backend/tests/barcode.test.js` (16), `backend/tests/productLookup.test.js`
(13), `backend/tests/collectionsIntegration.test.js` (M10, M11, R11),
`backend/tests/allergyVerdict.test.js` (M13), `backend/tests/rateLimit.test.js`
(M14), `backend/tests/e2eGate.test.js` (A10).

## A2 - validacao por mutacao

```text
mortas 27 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Os cinco mutantes sugeridos pelo prompt estao entre os treze novos:

```text
P1   M1  o digito verificador aceita qualquer codigo                    MORTA
P1b  M1  o calculo usa peso fixo pela esquerda (erra EAN-8 ou EAN-13)   MORTA
P2   M3  tira a validacao do backend e deixa so no frontend             MORTA
P2b  M3  a regra do backend passa a exigir digito de TODO codigo        MORTA
P3   M4  o caminho manual monta o resultado por conta propria           MORTA
P3b  M4  o caminho manual deixa de conferir e vira o da camera          MORTA
P4   M5  remove o piso de risco do veredito                             MORTA
P5   M9  o frontend ganha copia propria da funcao                       MORTA
P5b  M9  o backend para de importar a compartilhada                     MORTA
P6   M7  UPC-A deixa de normalizar para EAN-13                          MORTA
P7   M6  colapsa digito invalido e nao encontrado na mesma mensagem     MORTA
P8   M8  passa a limpar qualquer caractere em silencio                  MORTA
P9  M10  remove a validacao do backend: codigo invalido chega ao banco  MORTA
```

Mais os catorze herdados da v0.7.2 (N1 a N5, M1 a M7), todos MORTOS. Nenhum
sobrevivente.

`P1b` merece nota: ele nao desliga a conferencia, apenas calcula o peso a partir
da esquerda com peso inicial fixo. Isso acerta um dos formatos e erra o outro -
EAN-13 e EAN-8 tem paridade invertida quando contados da esquerda. E o tipo de
defeito que passa se a bateria so testar um formato. A bateria testa os tres.

### O script de mutacao nao conseguia testar tres alvos

Na primeira rodada, `P2`, `P5b` e `P9` sairam como **INAPLICAVEL**: a ancora de
varias linhas nao casava.

A causa era fim de linha. `backend/src/utils/validation.js` esta com CRLF no
disco - o Git converte no checkout do Windows - e as ancoras eram escritas com
`\n`. O script anunciava que nao conseguiu testar, em vez de testar errado, que
e o comportamento menos ruim dos dois; mas o efeito pratico era o mesmo de nao
ter o teste.

A comparacao passou a normalizar o fim de linha. Os bytes originais continuam
guardados para a restauracao, entao o arquivo volta ao disco exatamente como
estava. Com isso os tres rodaram e morreram.

## A9 - o gate E2E real

**PASS, exit code 0, com `manualCodeLookup` em PASSED.**

```text
mode                    strict
manualCodeLookup        PASSED
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
ok                      true
```

Saida literal completa, tabela de subgates e `E2E_LAST_RUN.json` integral estao
no E2E_REPORT desta versao.

Residuo no banco apos a execucao: **0** em todos os seis padroes conferidos, e
`product_history` de volta a zero - o subgate grava e a cascata apaga junto com
a conta.

## A10 - os 17 requisitos antigos continuam exigidos

```text
modo strict, com a flag da IA:  18 requisitos
os 17 da v0.7.2:                todos presentes
acrescentado:                   manualCodeLookup, e so ele
```

O teste nao se contenta com presenca na lista: para cada um dos 17, ele poe o
requisito em `NOT_EXECUTED` e exige que `findMissingRequirements` devolva
exatamente aquele. Um requisito que existe mas nunca reprova e decoracao.

`manualCodeLookup` e requisito BASE, nao condicional a flag da Anthropic. Amarra-
lo a IA deixaria o gate aprovar uma execucao sem chave que nunca exercitou a
consulta por codigo - que e justamente o caminho que esta versao existe para
tornar auditavel.

O teste `A12` da v0.7.0 precisou ser ajustado: ele travava o total absoluto em
17. Em vez de trocar o numero - que e o gesto errado, e ensina a "consertar"
testes -, ele passou a afirmar o que de fato guarda: que nenhum dos 14
requisitos anteriores a v0.7.0 sumiu, e que os acrescentados desde entao sao
exatamente `historySync`, `favoritesSync`, `verdictFreshness` e
`manualCodeLookup`. Quem trava o total exato e `A10`.

## A4 a A8, A11, A12, A13

```text
A4   npm run build                    OK
A5   npm --prefix backend test        224 testes, 223 pass, 0 fail, 1 SKIP
A6   suite contra PostgreSQL real     23/23 na suite de colecoes, 0 fail
A7   npm audit --audit-level=moderate 0 vulnerabilidades nos dois pacotes
A8   node scripts/verify-release.js   exit code 0
A11  gasto do gate por balde          colecoes 12, auth 3, assistente 2
A12  residuo NutriVa                  0 em codigo, interface e manifestos
A13  versao 0.7.3 nos 7 pontos        consistente
```

## O que esta versao NAO prova

```text
camera em hardware real        NAO EXECUTADO - exige aparelho com camera
decodificacao optica           NAO EXECUTADO - nenhuma imagem foi decodificada
Open Food Facts real           NAO EXECUTADO - a busca do gate e injetada
suite de colecoes no Neon      NAO EXECUTADO - por decisao de risco
carga simultanea real          NAO EXECUTADO
```

**A atestacao da camera em hardware continua ABERTA e esta versao nao a fecha.**

O que ela fez foi tornar o caminho POSTERIOR a decodificacao executavel e
auditavel. A parte optica - enquadramento, foco, leitura em embalagem amassada,
lanterna, confirmacao por leitura dupla - continua declarada e nao provada,
exatamente como estava na v0.6.9.

A busca a Open Food Facts e injetada no subgate de proposito: o que se prova e o
nosso caminho, nao a disponibilidade de terceiro. O efeito colateral honesto e
que o contrato real da API da Open Food Facts - formato da resposta, campos, 404
- nao e exercitado por nenhum gate.

Uma observacao que nao e defeito desta versao: `cleanBarcode`, usado no caminho
da camera, remove caracteres nao numericos. Um CODE_128 alfanumerico e portanto
mutilado antes da busca. Isso e anterior a esta versao e fora do escopo dela;
fica registrado para decisao.


## Auditoria da v0.7.2 - 2026-09-20

## Escopo

Correcao do defeito E1 e da ressalva E2 da auditoria externa da v0.7.1, mais a
execucao do gate E2E real.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, `shared/allergyVerdict.js`, todo o
`backend/src/ai/`, autenticacao, scrypt, sessoes e o schema do banco. Nenhuma
migration nova. Os limites de `auth` e `assistente` nao foram tocados.

A decisao da v0.7.1 de NAO implementar bypass foi mantida, como o auditor pediu.

## E1 - a chave por usuario tinha eliminado o teto por IP

### A afirmacao falsa

O comentario que a v0.7.1 deixou no codigo dizia:

```text
"Isso conserta o harness sem afrouxar nada"
```

Era falso, e o proprio texto documentava o contrario do que o codigo fazia.
`requireAuth` roda antes do limitador, entao toda requisicao que chega ali ja
tem sessao e o ramo de IP nunca executava. O teto por usuario **substituiu** o
teto por IP em vez de somar a ele.

### A1 - reproducao ANTES da correcao

App real contra PostgreSQL 17.10 real, contas criadas do mesmo endereco:

```text
Endereco de origem de todas as contas: 127.0.0.1
Teto por usuario declarado: 300 por 10 minutos

conta 0: 300 requisicoes aceitas, 429 na requisicao 301
conta 1: 300 requisicoes aceitas, 429 na requisicao 301
conta 2: 300 requisicoes aceitas, 429 na requisicao 301
conta 3: 300 requisicoes aceitas, 429 na requisicao 301

contas criadas do MESMO IP: 4
TOTAL de requisicoes de colecoes aceitas: 1200
teto efetivo por IP observado: 1200
```

Numero identico ao que o auditor mediu. Nao havia teto por IP nenhum: com mais
contas, o total crescia linearmente.

### A2 - DEPOIS da correcao

Mesmo script, 12 contas:

```text
conta 0: 300 requisicoes aceitas, 429 na requisicao 301
conta 1: 300 requisicoes aceitas, 429 na requisicao 301
conta 2: 300 requisicoes aceitas, 429 na requisicao 301
conta 3: 300 requisicoes aceitas, 429 na requisicao 301
conta 4: 300 requisicoes aceitas, 429 na requisicao 301
conta 5: 300 requisicoes aceitas, 429 na requisicao 301
conta 6: 300 requisicoes aceitas, 429 na requisicao 301
conta 7: 300 requisicoes aceitas, 429 na requisicao 301
conta 8: 300 requisicoes aceitas, 429 na requisicao 301
conta 9: 300 requisicoes aceitas, 429 na requisicao 301
conta 10: 0 requisicoes aceitas, 429 na requisicao 1
conta 11: 0 requisicoes aceitas, 429 na requisicao 1

contas criadas do MESMO IP: 12
TOTAL de requisicoes de colecoes aceitas: 3000
```

O total para em exatamente 3000, o teto por IP, e as contas 10 e 11 sao
recusadas na PRIMEIRA requisicao. Criar conta nova deixou de ser um caminho para
mais cota.

Nota de honestidade sobre essa saida: o script de reproducao imprime, ao final,
a frase "E1 REPRODUZIDO" sempre que o total passa do teto por usuario. Na
execucao pos-correcao essa frase aparece e esta ERRADA - o rotulo compara com o
teto por usuario, nao com o de IP. Os numeros acima e que valem, e eles mostram
o teto por IP funcionando. O rotulo foi corrigido depois da captura.

### A composicao escolhida

```js
export function criarLimitadoresDeColecoes({ tetoPorUsuario, tetoPorIp, janelaMs }) {
  const porUsuario = rateLimit({ ..., keyGenerator: collectionsRateLimitKey });
  const porIp      = rateLimit({ ..., keyGenerator: collectionsIpRateLimitKey });
  return [porUsuario, porIp];
}
```

Os dois rodam em sequencia. Passar exige caber nos dois; qualquer um recusando
termina em 429, fail-closed.

**A ordem nao e estilo.** O teto por usuario e conferido primeiro. Com o de IP
na frente, a requisicao 301 de um usuario abusivo passaria pelo contador de IP -
incrementando-o - para so entao ser recusada pelo contador de usuario. O abusivo
gastaria orcamento compartilhado com requisicoes que nem foram atendidas,
punindo os vizinhos de NAT. Com o usuario na frente, a recusa acontece antes de
tocar no contador de IP.

Isso tem teste proprio (`R4 a requisicao recusada pelo teto de usuario nao
consome orcamento do IP`) e mutante proprio (`N3`, que inverte a ordem).

### Alternativas descartadas

```text
so teto por IP                     era D1: quebra a suite de integracao e pune NAT
so teto por usuario                era E1: contas novas contornam o teto
teto por IP baixo, perto de 300    traz D1 de volta (a suite gasta 372)
bypass so para teste               recusado na v0.7.1 e reafirmado pelo auditor
teto global por rota               nao distingue abusivo de usuario legitimo
```

## A3 - a medicao que sustenta o teto por IP

### Requisicao 4.2 (a): a suite de integracao

A suite foi instrumentada - contagem no unico ponto por onde todas as
requisicoes passam - e o numero e reportado a cada execucao:

```text
[R11] gasto de colecoes desta suite: 372 de 3000 (folga 8.06x)
```

**372 requisicoes de colecoes de um unico IP.** Isso explica D1 de forma
definitiva: contra o teto de 300 por IP da v0.7.0, a suite estourava no oitavo
teste. O contador do limitador e de modulo e sobrevive aos servidores que cada
teste sobe e derruba, entao o gasto e a soma de tudo.

### Requisicao 4.2 (b): o gate E2E

`scripts/e2e-real.js` ja media o proprio gasto desde a v0.7.1:

```text
colecoes    9 requisicoes
auth        3 requisicoes
assistente  2 requisicoes
```

### Requisicao 4.2 (c) e (e): o teto escolhido e a folga

```text
teto por IP escolhido        3000 por 10 minutos
maior gasto medido            372 (suite de integracao)
folga                        8,06x
```

### Requisicao 4.2 (d): por que 3000, e nao um numero perto de 300

A restricao que manda **nao e o teste** - e o caso NAT/CGNAT, que foi a
motivacao original do teto por usuario. Atras de NAT corporativo ou de CGNAT de
operadora, comum no celular, varias pessoas legitimas compartilham um endereco.

O modelo declarado: uso intenso de verdade gira em torno de **60 requisicoes de
colecoes por 10 minutos por pessoa** - cada produto aberto grava uma linha de
historico, mais as leituras de lista. 3000 acomoda cerca de **50 pessoas nesse
ritmo** atras do mesmo endereco, ou 10 pessoas gastando a cota individual
inteira.

Do outro lado, ele contem de verdade: antes, um endereco nao tinha teto algum e
crescia com o numero de contas; agora para em 3000 por janela, independentemente
de quantas contas o atacante criar.

A folga de 8x e generosa de proposito. O teto por IP e rede de contencao contra
abuso multiconta, nao o controle primario, e voltar a quebrar a suite de
integracao seria repetir D1 - o defeito cujo custo foi uma versao inteira sem os
testes de isolamento rodarem.

### A folga e conferida sozinha, a cada execucao

`R11` reprova se a folga cair abaixo de 4x, com mensagem que explica o que fazer.
Se um teste novo empurrar o gasto da suite, o aviso chega antes de virar falha
por quota com `Unexpected token 'T', "Too many r"`.

## 4.3 - restricoes de seguranca do mecanismo

### Nenhum bypass

Nenhuma variavel de ambiente, cabecalho, query string ou cookie desliga qualquer
um dos dois limitadores. Provado por `Q3` e `Q4`, e por mutacao (`M3`, `M3b`).

### Nenhum dado do request escolhe balde

`R5` prova por comportamento, com os dois baldes testados separadamente:

```text
R5 dados forjados no request nao conseguem balde de USUARIO novo
R5 dados forjados no request nao conseguem balde de IP novo
```

Quinze tentativas ao todo: `x-usuario`, `x-user-id`, `x-teste-usuario`, cookie,
`x-rate-limit`, query de usuario, query de desligamento, `X-Forwarded-For`,
`X-Real-IP`, `X-Client-IP`, `True-Client-IP`, `CF-Connecting-IP`, `Forwarded`,
`X-Originating-IP` e query de IP. Todas continuam recebendo 429.

### `trust proxy` conferido por medicao

`env.trustProxy` liga `app.set("trust proxy", 1)` em producao. Medido nesta
versao, com um servidor real:

```text
XFF ausente                          -> req.ip = 127.0.0.1
XFF "203.0.113.9"                    -> req.ip = 203.0.113.9
XFF "1.2.3.4, 203.0.113.9"           -> req.ip = 203.0.113.9
XFF "9.9.9.9, 8.8.8.8, 203.0.113.9"  -> req.ip = 203.0.113.9
```

`req.ip` e sempre o ultimo valor, que e o que o proxy do Render acrescenta. O
cliente pode prefixar o que quiser e nao muda a propria identidade. E e por isso
que o teto por IP nao vira teto global: sem `trust proxy`, todos apareceriam com
o endereco do proxy.

### IPv6: o /64 e a unidade

Quem recebe um `/64` da operadora tem 2^64 enderecos. Sem normalizar, trocar de
endereco a cada requisicao daria um balde novo toda vez e o teto por IP seria
enfeite - protegeria nada, que e uma das condicoes de bloqueio da secao 11.

```text
2001:db8:1234:5678::1           -> ip:2001:db8:1234:5678::/64
2001:db8:1234:5678:aaaa:b:c:d   -> ip:2001:db8:1234:5678::/64
2001:db8:1234:9999::1           -> ip:2001:db8:1234:9999::/64   (outro bloco)
::ffff:203.0.113.9              -> ip:203.0.113.9               (IPv4 mapeado)
```

`express-rate-limit` 7.5.1 nao exporta o auxiliar `ipKeyGenerator`, entao a
normalizacao e propria e tem teste (`R5 um bloco IPv6 /64 nao vira infinitos
baldes`) e mutante (`N5`).

## 4.4 - o comentario falso

Removido. O comentario novo descreve a composicao dos dois tetos, cita a medicao
de 1200 requisicoes de 4 contas do mesmo IP como o motivo de o teto por IP
existir, e explica por que a ordem de verificacao importa.

## E2 - disciplina de escopo

Entrada retroativa gravada no CHANGELOG, nomeando os cinco artefatos e por que
entraram:

```text
src/components/allergies/AllergyPicker.jsx   commit 641aa5f
src/styles-v070.css                          commit 641aa5f
public/nutriscan-icon.svg                    commit 641aa5f
public/nutriscan-logo.png                    commit 641aa5f
scripts/pack-release.ps1                     commit 7b19c6e
```

Os quatro primeiros vieram no commit que aplicou o pacote de design enviado pelo
dono do projeto. `pack-release.ps1` entrou no commit da v0.7.1.

### Duas alteracoes desta versao que PRECISAM de decisao do auditor

A secao 5 manda descrever em vez de implementar. Estas duas foram implementadas
porque sao consequencia direta de falhas ocorridas durante o proprio trabalho
desta versao, dentro da maquinaria que a secao 8 exige. Ficam declaradas aqui
para julgamento:

**1. `scripts/mutation-check.js` ganhou um jornal de restauracao em disco.**
A versao anterior confiava em `process.on("exit")`. Uma execucao desta versao foi
interrompida de fora, o manipulador nao rodou, e a arvore de trabalho ficou com a
mutacao aplicada: `TETO_COLECOES_POR_USUARIO = 100000`, ou seja, o limitador de
producao praticamente desligado. Um script que injeta defeitos de proposito nao
pode depender de sair com educacao. Se o auditor preferir reverter, o defeito que
isso evita esta descrito e pode ser reintroduzido.

**2. `backend/tests/rateLimit.test.js` deixou de derivar o teto de producao da
constante que vigia.** Descrito adiante, em "o que a mutacao encontrou".

Fora esses dois e o que as secoes 4 e 6 pedem, nada novo foi entregue.

## A4 - R1 a R11

```text
✔ R1  usuario dentro do teto mas IP estourado recebe 429
✔ R2  IP dentro do teto mas usuario estourado recebe 429
✔ R3  multiplas contas do mesmo IP nao ultrapassam o teto por IP
✔ R4  usuarios de IPs distintos nao consomem cota um do outro
✔ R4  dois usuarios atras do MESMO IP mantem cotas separadas ate o teto do IP
✔ R4  a requisicao recusada pelo teto de usuario nao consome orcamento do IP
✔ R5  dados forjados no request nao conseguem balde de USUARIO novo
✔ R5  dados forjados no request nao conseguem balde de IP novo
✔ R5  com trust proxy o cliente nao escolhe o proprio IP
✔ R5  a chave de usuario vem da sessao, e a de IP vem de req.ip
✔ R5  um bloco IPv6 /64 nao vira infinitos baldes
✔ R6  os tres tetos por rota seguem nos valores declarados
✔ R7  o teto por IP esta no valor medido, e ele cobre as suites com folga
ℹ tests 17, pass 17, fail 0, skipped 0
```

R8, R9 e R11 ficam na suite de integracao, contra PostgreSQL real:

```text
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
✔ R11 o gasto de colecoes desta suite cabe no teto por IP
[R11] gasto de colecoes desta suite: 372 de 3000 (folga 8.06x)
ℹ tests 19, pass 19, fail 0, skipped 0
```

**R8 confirmado: 19/19 com o teto por IP ligado, zero SKIP, zero falha por
quota.** D1 nao voltou.

R10, a regressao C1:

```text
✔ T1 exploit C1: modelo negando conflito nao entrega falso seguro
✔ T2 piso de risco: com conflito declarado o safety final nunca e normal
✔ T3 barreira 1: schema rejeita allergyVerdict vindo do modelo
✔ T3 barreira 2: veredito entregue vem do motor mesmo se o campo chegar montado
ℹ tests 12, pass 12, fail 0
```

## A5 - validacao por mutacao

`scripts/mutation-check.js` injeta o defeito, roda os testes que deveriam
pega-lo e EXIGE que fiquem vermelhos. Os quatro mutantes sugeridos pelo auditor
estao entre os catorze.

```text
N1   R1/R3 MORTA  remove o teto por IP e deixa so o de usuario (o defeito E1)
N1b  R3    MORTA  remove o teto por IP: multiplas contas voltam a passar sem limite
N2   R2    MORTA  remove o teto por usuario e deixa so o de IP (o defeito D1)
N2b  R4    MORTA  remove o teto por usuario: vizinhos de NAT voltam a se derrubar
N3   R4    MORTA  confere o IP antes do usuario: recusas gastam cota do IP
N4   R5    MORTA  le o balde de IP de um cabecalho do request
N5   R5    MORTA  para de normalizar IPv6: um bloco /64 vira 2^64 baldes
M1   R6    MORTA  afrouxa o teto de autenticacao de 40 para 100
M2   R7    MORTA  derruba o teto por IP para 300, valor que quebraria a suite
M3   Q3    MORTA  cria um bypass por variavel de ambiente
M3b  Q4    MORTA  adiciona um skip acionado por cabecalho
M4   Q2    MORTA  eleva o teto por usuario a um valor inalcancavel
M6   R9    MORTA  remove o filtro por dono da leitura de historico
M7   R9    MORTA  remove o filtro por dono da remocao de favorito

mortas 14 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

**Nenhum mutante sobreviveu na rodada final.** Mas dois sobreviveram antes, e os
dois apontavam defeitos reais nos testes.

### O que a mutacao encontrou - 1: um balde escondia o outro

`N4` troca a chave de IP por um cabecalho do request. Na primeira rodada ele
**SOBREVIVEU** ao teste comportamental de `R5` e foi pego apenas pela leitura do
codigo-fonte, que e a rede mais fraca das duas.

A causa: `R5` rodava com os dois tetos em 10. O teto por usuario e conferido
primeiro, entao era sempre ele quem devolvia o 429, e o balde de IP ficava
escondido atras dele. Forjar o cabecalho criava um balde de IP novo, mas a
resposta continuava 429 por outro motivo, e o teste nao via diferenca.

A correcao nao foi alargar a expressao do teste de texto. `R5` virou dois testes,
cada um com o OUTRO teto folgado, de modo que se saiba exatamente qual limitador
produziu a recusa. Com isso `N4` morre por comportamento.

### O que a mutacao encontrou - 2: um teste que lia a constante que vigiava

`M4` infla `TETO_COLECOES_POR_USUARIO` para 100000. `Q2` montava o laco com
`TETO_COLECOES_POR_USUARIO + 1` e, em vez de falhar, saiu fazendo 100001
requisicoes ate estourar o tempo.

Um teste que deriva a expectativa da mesma constante que deveria vigiar nao
vigia nada: se alguem inflar a constante, o teste infla junto e continua verde.
O valor de producao passou a ser escrito a mao no teste, e `R6` e quem confere
que a constante bate com ele. Os dois precisam concordar.

Essa execucao interrompida e a que deixou a mutacao no repositorio, e foi o que
motivou o jornal de restauracao declarado na secao de escopo.

## A14 - os 17 requisitos strict continuam exigidos

`findMissingRequirements({})` com a flag da Anthropic ligada:

```text
 1. backendProcess       7. isolation            13. historySync
 2. database             8. logout               14. favoritesSync
 3. migrations           9. assistantAuthority   15. verdictFreshness
 4. auth                10. deterministicEngine  16. anthropicReal
 5. sessionSchema       11. fallback             17. assistantAuthenticated
 6. multiDevice         12. privacy

TOTAL: 17
```

Sem a flag sao 15; os dois ultimos sao condicionais a ela, por desenho. Nenhum
requisito foi removido nesta versao.

## A15 - residuo do nome antigo

Varredura por `nutriva`, sem distincao de maiuscula:

```text
src/, backend/src/, shared/, public/, index.html    0 ocorrencias
package.json, backend/package.json, os 2 lockfiles  0 ocorrencias
```

Onde ainda aparece, e por que e correto que apareca:

```text
CHANGELOG.md                  secoes historicas: registro do que aconteceu
AUDIT_REPORT.md               secao historica
backend/tests/productName.test.js   guarda o nome antigo como padrao de deteccao
releases/README.md            cita o nome do pacote v0.6.9, com justificativa
releases/SHA256SUMS.txt       nome do arquivo entregue ao auditor na v0.6.9
```

O pacote `nutriva-v0.6.9-auditoria.zip` nao foi renomeado de proposito: foi assim
que saiu e foi assim que o auditor o recebeu. Renomea-lo quebraria a
correspondencia com o `SHA256SUMS.txt`.

## A13 - o gate E2E real, com credenciais reais

**PASS, exit code 0.** Primeira versao do projeto em que o gate completo fecha.

```text
[OK] doctor:e2e
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
=== EXIT CODE: 0 ===
```

```text
mode                    strict
anthropic               configured
anthropicReal           EXECUTED_GENERIC_AND_PRODUCT
anthropicCalls          2
historySync             PASSED
favoritesSync           PASSED
verdictFreshness        PASSED
ok                      true
```

`anthropicReal` saiu de `NOT_EXECUTED`. Nenhum subgate ficou em SKIP.

Saida literal completa, tabela de subgates e `E2E_LAST_RUN.json` integral estao
no E2E_REPORT desta versao.

### Residuo no banco apos a execucao

```text
users 4 | sessions 5 | product_history 0 | product_favorites 0
residuo de teste: 0 em todos os seis padroes conferidos
linhas orfas: 0
```

Os 4 usuarios sao contas reais, anteriores a execucao.

### Uma decisao de risco, declarada

O gate rodou contra o **Neon de producao**, por escolha explicita do dono do
projeto, depois de eu apresentar por escrito o risco e o precedente da v0.6.6 -
quando um `npm test` com a string de producao deixou linha de teste em producao.

A precaucao tomada: `RUN_DB_INTEGRATION_TESTS` foi mantida DESLIGADA em toda
execucao apontada para o Neon. Essa flag libera a suite de colecoes, que sozinha
grava 201 favoritos e mais de 100 linhas de historico. Ela rodou apenas contra o
PostgreSQL 17.10 local.

### Exposicao de credencial ocorrida durante esta versao

Ao pedir que o dono preenchesse `backend/.env`, eu mesmo criei o arquivo antes.
Como o ambiente passa a rastrear arquivos que eu escrevo, o conteudo salvo
voltou inteiro para o meu contexto - `DATABASE_URL` e `ANTHROPIC_API_KEY`
incluidos. A regra 6.1 do prompt manda parar e avisar nesse caso, e foi o que
aconteceu.

O dono foi avisado, recomendou-se a troca das duas credenciais, e ele decidiu
seguir com a execucao e trocar ao fim do projeto. A decisao e dele e esta
registrada aqui. **A troca continua pendente.**

O procedimento correto, para a proxima vez: nao criar nem ler o arquivo de
credencial: pedir que o dono o crie do zero.

## A8 a A12 - gates de codigo

```text
A8   npm run build                    OK, built in 6.51s
A9   npm --prefix backend test        188 testes, 187 pass, 0 fail, 1 SKIP
A10  suite contra PostgreSQL real     19/19, 0 fail, 0 skip
A11  npm audit --audit-level=moderate found 0 vulnerabilities nos dois pacotes
A12  node scripts/verify-release.js   exit code 0
```

### O unico SKIP da suite, declarado

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental num `npm test` comum. **NAO EXECUTADO
nao conta como PASS.** A propriedade que ele cobriria foi provada de outro jeito
nesta versao: o gate E2E fez as duas chamadas reais a Claude, com
`anthropicReal: EXECUTED_GENERIC_AND_PRODUCT`.

### Uma leitura que pode enganar, declarada

`verify:release` roda sem `RUN_DB_INTEGRATION_TESTS`, e a partir desta versao
existe um `DATABASE_URL` em `backend/.env`. A combinacao faz as suites de banco
se declararem NAO EXECUTADO em vez de ausentes, e a contagem do gate sai assim:

```text
ℹ tests 188
ℹ pass 163
ℹ fail 0
ℹ skipped 25
```

**Os 25 SKIP nao sao regressao e nao sao PASS.** Sao as mesmas suites que rodam
verdes com a flag ligada - 19 de colecoes, 5 de integracao e 1 da chamada paga.
A execucao autoritativa e a de cima, com a flag ligada, contra PostgreSQL local:
187 pass, 1 skip.

A flag ficou desligada de proposito em toda execucao apontada para o Neon de
producao, pelo motivo descrito na secao de risco.

## O que esta versao NAO prova

```text
camera real em aparelho        NAO EXECUTADO - exige hardware
carga simultanea real          NAO EXECUTADO - o limitador foi provado em processo
suite de colecoes no Neon      NAO EXECUTADO - por decisao de risco, descrita acima
```

O teto por IP foi provado contra um servidor Express real, em processo, e contra
o app real com contas criadas de verdade no banco. Ele nao foi exercitado com
usuarios simultaneos atras de um NAT real - o modelo de 50 pessoas a 60
requisicoes e uma estimativa declarada, nao uma medicao de campo. Se a producao
mostrar 429 em usuario legitimo, o numero precisa ser revisto com dado real.

Um aviso de depreciacao do driver `pg` sobre `sslmode=require` aparece em toda
conexao ao Neon. Nao e erro e nao afeta o resultado; ficou sem correcao de
proposito, por estar fora do escopo desta versao.


## Auditoria da v0.7.1 - 2026-09-20

## Escopo

Correcao do defeito D1 da auditoria externa da v0.7.0 e verificacao do defeito
D2 da mesma auditoria.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, `shared/allergyVerdict.js`, todo o
`backend/src/ai/`, autenticacao, scrypt, sessoes e o schema do banco. Nenhuma
migration nova.

## Abordagem escolhida para D1

O prompt de versao oferecia duas saidas. Foi escolhida a **(a): contagem por
usuario da sessao, com reserva por IP**. A opcao (b), um bypass so de teste,
foi recusada.

O motivo e direto: um bypass e uma porta. Mesmo escrito para ser impossivel de
abrir em producao, ele existe no binario que roda em producao, e a garantia de
que nao pode ser aberto passa a depender de uma condicao que alguem precisa
manter correta para sempre. A alternativa nao tem porta nenhuma para guardar.

A escolha tambem resolve um problema real de producao, independente do teste:
atras de NAT corporativo ou CGNAT de operadora - situacao comum no celular, que
e onde este app vive - varios usuarios compartilham um IP, e antes um deles
sozinho podia consumir a cota de todos.

**Consequencia formal: Q3 e Q4 do prompt, que so valem "se escolher a abordagem
de bypass", nao se aplicam.** Nao ha mecanismo de bypass para testar. No lugar
deles foi provada uma propriedade mais forte - que a porta nao existe - e os
testes correspondentes estao registrados abaixo com os nomes Q3 e Q4 para
manter a rastreabilidade com o prompt.

## A correcao

`backend/src/middleware/rateLimit.js`:

```js
export function collectionsRateLimitKey(req) {
  const userId = req?.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req?.ip ?? "desconhecido"}`;
}

export const collectionsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: collectionsRateLimitKey,
});
```

O diff util tem nove linhas. `requireAuth` ja rodava antes deste middleware nas
duas rotas - essa ordem e anterior a esta versao e nao foi alterada -, entao
`req.user` esta disponivel quando a chave e calculada.

A reserva por IP quase nao e usada aqui, porque `requireAuth` devolve 401 sem
sessao valida. Ela existe para que o limitador continue seguro se alguem o
montar numa rota publica no futuro, e para que uma requisicao sem IP conhecido
nao vire chave vazia, que juntaria todos os anonimos num balde so.

## Q1 - a suite de integracao contra PostgreSQL real

PostgreSQL 17.10 real, porta 5433, binarios em
`C:\Users\diego\AppData\Local\nutriscan-pg`.

ANTES da correcao:

```text
ℹ tests 18
ℹ pass 9
ℹ fail 9
```

A primeira falha era F4, e a mensagem era sempre a mesma:

```text
SyntaxError: Unexpected token 'T', "Too many r"... is not valid JSON
```

DEPOIS da correcao:

```text
✔ H1  ✔ F1  ✔ H2  ✔ H3  ✔ H4  ✔ F2  ✔ F3
✔ F4 o limite de favoritos e aplicado e devolve erro, sem podar (3464.6631ms)
✔ S1  ✔ S2  ✔ S3  ✔ I1  ✔ I2  ✔ I3
✔ I4 e V1  ✔ A1  ✔ D1  ✔ a migration aplica e reaplica sem quebrar
ℹ tests 18
ℹ pass 18
ℹ fail 0
ℹ skipped 0
```

**Zero SKIP.** Nenhum teste foi removido, comentado, marcado como `todo` ou
transformado em SKIP permanente. Nenhuma assercao foi enfraquecida.

## Q2 - o limitador recusa em limite+1, em producao, sem bypass

`backend/tests/rateLimit.test.js`. O teste sobe um servidor real com
`NODE_ENV=production`, faz 301 requisicoes autenticadas e conta:

```text
✔ Q2 em producao o limitador recusa na requisicao seguinte ao teto (3388.2326ms)
```

Assercoes: exatamente 300 respostas 200, e a requisicao 301 devolve 429.

## Q3 e Q4 - NAO APLICAVEL como escritos; a porta nao existe

Nao ha mecanismo de bypass, entao nao ha o que ligar ou desligar. O que foi
provado no lugar:

```text
✔ Q4 nenhum dado vindo do request consegue um balde novo (3445.1711ms)
✔ Q4 o limitador nao tem opcao de pular requisicao (3.7896ms)
✔ Q3 nenhuma variavel de ambiente desliga o limitador (1.199ms)
✔ Q3 o limitador esta montado em todas as rotas de colecoes (2.6188ms)
```

O primeiro e prova de comportamento, nao de texto-fonte: a sessao e sempre a
mesma pessoa, a cota e esgotada, e nove tentativas de conseguir um balde novo
continuam recebendo 429 - cabecalho de usuario, cabecalho de id, cabecalho de
autor, `X-Forwarded-For`, `X-Real-IP`, cookie, cabecalho de desligamento, query
de usuario e query de desligamento.

## Q5 - os tres limites de producao seguem nos valores declarados

```text
auth          windowMs: 15 * 60 * 1000    limit: 40
assistente    windowMs: 10 * 60 * 1000    limit: 20
colecoes      windowMs: 10 * 60 * 1000    limit: 300
```

```text
✔ Q5 os tres limitadores mantem janela e teto declarados (6.5745ms)
```

Nenhum dos tres foi afrouxado. O que mudou em colecoes foi a quem o limite se
aplica, nao o valor.

## Q6 - orcamento de requisicoes da suite E2E, com margem

Corrigir colecoes nao resolve auth nem assistente: os dois continuam contando
por IP, e todos os clientes da suite saem do mesmo endereco. A suite passou a
contar o proprio gasto e a reprovar se ultrapassar metade do teto. Medido na
execucao desta versao:

```json
{
  "margem": "no maximo 50% do teto",
  "baldes": [
    { "balde": "assistente", "usado": 2, "teto": 20,  "margemMaxima": 10,  "folga": 18,  "dentroDaMargem": true },
    { "balde": "auth",       "usado": 3, "teto": 40,  "margemMaxima": 20,  "folga": 37,  "dentroDaMargem": true },
    { "balde": "colecoes",   "usado": 9, "teto": 300, "margemMaxima": 150, "folga": 291, "dentroDaMargem": true }
  ],
  "estouraram": []
}
```

As requisicoes de colecoes caem num balde so de proposito. Separar por cliente
pareceria mais preciso e seria errado: `clientB` faz login com o e-mail de A,
entao dois dos tres clientes da suite sao a mesma conta e dividem o balde. Um
orcamento que se engana para menos nao serve para nada.

O limite e fail-closed: estourar a margem lanca antes de `report.ok = true`.

## Q7 - a regressao de isolamento esta verde e detecta quebra real

```text
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
```

Verde nao basta - veja a validacao por mutacao adiante, que prova que estes
testes ficam vermelhos quando o isolamento e quebrado de verdade.

## Q8 - a regressao C1 continua bloqueada

```text
✔ T1 exploit C1: modelo negando conflito nao entrega falso seguro (319.2708ms)
✔ T2 piso de risco: com conflito declarado o safety final nunca e normal
✔ T3 barreira 1: schema rejeita allergyVerdict vindo do modelo
✔ T3 barreira 2: veredito entregue vem do motor mesmo se o campo chegar montado
ℹ tests 12
ℹ pass 12
ℹ fail 0
```

## Q9 - o limiar de auditoria continua moderate

`scripts/verify-release.js:82-83`:

```js
["frontend audit", () => npmCommand(["audit", "--audit-level=moderate"], { inherit: true })],
["backend audit",  () => npmCommand(["--prefix", "backend", "audit", "--audit-level=moderate"], { inherit: true })],
```

Travado por `backend/tests/auditThreshold.test.js`, que reprova se o limiar
subir para `high` ou `critical` ou se qualquer uma das duas etapas sumir.

## Validacao por mutacao

`scripts/mutation-check.js` injeta defeitos reais, roda os testes que deveriam
pega-los e exige que fiquem vermelhos. O codigo original e restaurado sempre,
inclusive se o processo for interrompido.

```text
M1   Q5   MORTA   "Q5 os tres limitadores mantem janela e teto declarados" falhou, como deveria
M2   Q2   MORTA   "Q2 em producao o limitador recusa na requisicao seguinte ao teto" falhou, como deveria
M3   Q3   MORTA   "Q3 nenhuma variavel de ambiente desliga o limitador" falhou, como deveria
M4   Q4   MORTA   "Q4 nenhum dado vindo do request consegue um balde novo" falhou, como deveria
M4b  Q4   MORTA   "Q4 o limitador nao tem opcao de pular requisicao" falhou, como deveria
M5   D1   MORTA   "D1 a cota de um usuario nao consome a cota de outro" falhou, como deveria
M6   Q7   MORTA   "I1 usuario A nao le historico nem favorito de B" falhou, como deveria
M7   Q7   MORTA   "I2 usuario B nao remove item de A" falhou, como deveria
======
mortas 8 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Os defeitos injetados: afrouxar o teto de auth para 100; elevar o teto de
colecoes a um valor inalcancavel; criar um bypass por variavel de ambiente;
fazer a chave depender de um cabecalho do cliente; adicionar um `skip` acionado
por cabecalho; voltar a contar por IP; remover o filtro `user_id` da leitura de
historico; remover o filtro `user_id` da remocao de favorito.

### A mutacao encontrou um defeito real nesta versao

Na primeira rodada, **M4 sobreviveu**. O teste Q4 original procurava `req.get`
no codigo-fonte, e a mutacao escreveu `req?.get?.(`, com encadeamento opcional.
A expressao nao casava, e o defeito passou despercebido.

Isso nao foi corrigido alargando a expressao e seguindo em frente. Casar texto
e fragil justamente onde a propriedade importa: a proxima forma de escrever a
mesma leitura volta a escapar. O teste foi refeito como prova de comportamento,
e a versao de texto-fonte ficou como reforco, agora cobrindo as duas formas de
escrita. Com o teste novo, M4 morre.

Este e o argumento a favor de exigir mutacao: sem ela, o relatorio teria
declarado Q4 aprovado com um teste que nao protegia nada.

## D2 - verificacao da correcao P2 da v0.6.9

Saida literal das duas execucoes:

```text
$ npm audit --audit-level=moderate
found 0 vulnerabilities
[exit code: 0]

$ npm --prefix backend audit --audit-level=moderate
found 0 vulnerabilities
[exit code: 0]
```

Os tres avisos moderate em `qs` (GHSA-x5fp-wj9c-mxmx e GHSA-4mjr-xmp4-gh2g) que
motivaram P2 nao reaparecem. A correcao esta efetiva.

## A12 - os 17 requisitos strict continuam exigidos

`findMissingRequirements({})` com a flag da Anthropic ligada:

```text
 1. backendProcess      7. isolation          13. historySync
 2. database            8. logout             14. favoritesSync
 3. migrations          9. assistantAuthority 15. verdictFreshness
 4. auth               10. deterministicEngine 16. anthropicReal
 5. sessionSchema      11. fallback           17. assistantAuthenticated
 6. multiDevice        12. privacy

TOTAL: 17
```

Sem a flag, 15 - os dois ultimos sao condicionais a ela, por desenho. Nenhum
requisito foi removido nesta versao.

## A13 - residuo do nome antigo

Varredura por `nutriva`, sem distincao de maiuscula, em todo o repositorio
exceto `node_modules/`, `.git/`, `dist/` e `releases/`:

```text
codigo-fonte (src/, backend/src/, shared/)     0 ocorrencias
interface e assets (public/, index.html)       0 ocorrencias
manifestos e lockfiles                         0 ocorrencias
```

O que resta e registro historico e esta correto que permaneca: as secoes
antigas do CHANGELOG, a secao historica do AUDIT_REPORT, e
`backend/tests/productName.test.js`, que guarda o nome antigo como padrao
justamente para detecta-lo se ele voltar.

### A primeira varredura passou por cima de um residuo real

A varredura acima excluiu `releases/` junto com `node_modules/` e `dist/`, por
serem pastas que nao vao para o repositorio. Ao abrir a pasta para gerar o
pacote desta versao, `releases/README.md` estava assim:

```text
# Pacotes de auditoria do NutriVa
...
$zip = [...]::OpenRead("releases\nutriva-vX.Y.Z-auditoria.zip")
Get-FileHash releases\nutriva-vX.Y.Z-auditoria.zip -Algorithm SHA256
```

Titulo e exemplos com o nome antigo, e a tabela de pacotes parada na v0.6.9.
Corrigido nesta versao.

O nome do arquivo `nutriva-v0.6.9-auditoria.zip` **nao** foi alterado, de
proposito: foi assim que o pacote saiu e foi assim que o auditor o recebeu.
Renomea-lo agora quebraria a correspondencia com o `SHA256SUMS.txt` e com o
registro da auditoria. A justificativa esta escrita no proprio README.

`P1t` nao teria pego isso: ele verifica codigo, manifesto, lockfile e interface,
e `releases/` nao e nenhum dos quatro. O aprendizado e sobre a varredura, nao
sobre o teste - "nao vai para o repositorio" nao e o mesmo que "nao importa".

## Resultado dos gates

```text
npm run build                          OK (built in 15.40s)
npm --prefix backend test              179 testes, 178 pass, 0 fail, 1 SKIP
npm audit --audit-level=moderate       0 vulnerabilidades (frontend e backend)
node scripts/verify-release.js         OK (build, testes, audit, secret scan)
npm run e2e:real                       ok: true (PostgreSQL 17.10 real)
npm run verify:e2e                     FAIL BEFORE CALL (exit 1) - sem chave
```

### O unico SKIP, declarado

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental, e se declara `NAO EXECUTADO`. **Nao
conta como PASS.** Nenhuma chave foi usada e nenhuma chamada paga foi feita.

## O que esta versao nao prova

```text
Claude real                    NAO EXECUTADO - sem ANTHROPIC_API_KEY no ambiente
camera real em aparelho        NAO EXECUTADO - exige hardware
comportamento sob Neon         NAO EXECUTADO - testado contra PostgreSQL 17.10 local
```

O limitador foi provado contra um servidor Express real, em processo, com
`NODE_ENV=production`. Ele nao foi exercitado contra o Render com varios
usuarios simultaneos.

Uma observacao que nao e defeito desta versao mas vale registro: em producao
`trust proxy` esta ligado (`backend/src/app.js:62`), o que faz `req.ip` vir do
`X-Forwarded-For`. A reserva por IP deste limitador seria, portanto, influenciavel
por cabecalho em producao - mas ela e inalcancavel nas rotas de colecoes, porque
`requireAuth` roda antes e devolve 401 sem sessao. Se alguem montar este
limitador numa rota publica no futuro, isso precisa ser reavaliado.


## Auditoria da v0.7.0 - 2026-09-18

## Escopo

Historico de consultas, favoritos e sincronizacao entre dispositivos, mais as
quatro pendencias herdadas da auditoria externa da v0.6.9.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, todo o `backend/src/ai/`, autenticacao,
scrypt, sessoes e o schema existente. `shared/allergyVerdict.js` nao foi tocado.

## Parte zero - as quatro pendencias

### P1 - o produto volta a se chamar NutriScan

O prompt de versao afirmava que a arvore de trabalho ja tinha voltado para
NutriScan e que faltava apenas verificar. **A premissa estava errada.** A
verificacao encontrou:

```text
package.json               name=nutriva
backend/package.json       name=nutriva-backend
package-lock.json          nutriva
backend/package-lock.json  nutriva-backend
87 ocorrencias em 32 arquivos
```

O historico tem um unico commit de renomeacao, `f740658`
("Renomeia o produto de NutriScan para NutriVa"), de 04/09/2026. Nao houve
reversao nenhuma. A divergencia foi levada ao dono do projeto antes de qualquer
alteracao, porque renomear o produto e decisao dele, nao do executor; ele
confirmou NutriScan.

Normalizacao aplicada a todos os 32 arquivos. Excecoes, cada uma justificada:

```text
CHANGELOG.md                 registro do que aconteceu, inclusive a renomeacao
AUDIT_REPORT / E2E_REPORT    apenas a secao historica, que cita o nome vigente
                             na epoca de cada versao
```

Tres identificadores NAO mudaram, e nunca mudaram em nenhuma das trocas:

```text
nutriscan:users             localStorage - trocar faz o app perder contas locais
nutriscan:guest-allergies   localStorage - trocar apaga alergias do visitante
nutriscan_session           cookie - trocar desloga todo mundo em producao
```

`backend/tests/productName.test.js` passa a reprovar se o nome antigo voltar a
codigo, manifesto, lockfile ou interface, e exige que os quatro manifestos
declarem `nutriscan`. A lista de excecoes esta justificada por escrito dentro do
proprio arquivo.

### P2 - o gate ignorava vulnerabilidade moderate

Reproduzido: `npm --prefix backend audit` reportava tres avisos moderate em
`qs`, puxado por `express` e `body-parser` - GHSA-x5fp-wj9c-mxmx (bypass de
array-limit) e GHSA-4mjr-xmp4-gh2g (DoS via isBuffer controlado por atacante).
O gate reportava `[OK]` porque as duas linhas de audit usavam
`--audit-level=high`.

`npm audit fix` resolveu nos dois pacotes, sem breaking change e sem `--force`.
O limiar do gate desceu para `moderate`, e
`backend/tests/auditThreshold.test.js` reprova se alguem subir de volta ou
remover uma das duas etapas de audit.

### P3 - render.yaml sem registro

Entrada retroativa no CHANGELOG e secao de deploy no README, descrevendo o
blueprint, o motivo de `--include=dev` no build e o motivo de o PostgreSQL ficar
no Neon e nao no Render.

### P4 - versao publicada divergindo da versao em execucao

`scripts/version-check.js` compara a versao de `package.json` com a anunciada
por `/api/health` de um deploy. Exit 0 quando batem, exit 1 quando divergem, e
exit 1 tambem quando nao da para consultar - nao conseguir perguntar nao e
aprovacao.

Exercitado nos tres caminhos. Contra producao, ele encontrou a divergencia real
que motivou o item:

```text
[FAIL] version:check - repositorio declara 0.7.0 e o deploy anuncia 0.6.8
```

## Modelo de dados

```sql
CREATE TABLE IF NOT EXISTS product_history (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  product_brand text,
  image_url text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_history_user_product_unique UNIQUE (user_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_product_history_user_viewed
  ON product_history (user_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS product_favorites (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_code text NOT NULL,
  product_name text NOT NULL,
  product_brand text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_favorites_user_product_unique UNIQUE (user_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_product_favorites_user_created
  ON product_favorites (user_id, created_at DESC);
```

Nenhuma coluna guarda veredito de alergia, nivel de risco ou alergenico
detectado. O perfil muda com o tempo, e um veredito congelado vira informacao de
seguranca errada - o produto seguro em marco deixa de ser quando a pessoa marca
uma alergia nova em abril.

## Decisoes, e por que

### Limites

```text
historico   100 itens, poda o mais antigo em silencio
favoritos   200 itens, recusa com 409 e nao poda
```

Cem produtos distintos cobrem meses de compra real; acima disso a lista deixa de
ser navegavel. A poda silenciosa e aceitavel ali porque o registro e automatico:
o usuario nunca pediu para guardar o item 101.

Favorito e intencao explicita. Descartar um em silencio para caber outro
apagaria uma escolha que a pessoa fez de proposito. Por isso o limite vira erro,
e quem decide o que sai e ela. O numero existe para limitar abuso, nao uso real.

### Conflito de escrita concorrente

Ultima escrita vence, medida pelo **relogio do servidor** (`now()` no
`ON CONFLICT DO UPDATE`), nunca por horario enviado pelo cliente. Aceitar
horario do cliente permitiria a um relogio adiantado fixar um registro no topo
da lista para sempre.

Nome e marca tambem sao atualizados na revisita: a Open Food Facts corrige
cadastro com o tempo, e o registro mais novo e o mais fiel.

### Deduplicacao no banco, nao na aplicacao

A dedup acontece no `ON CONFLICT` da restricao de unicidade. Um SELECT seguido
de INSERT deixaria duas requisicoes simultaneas do mesmo produto passarem as
duas pelo SELECT que nao encontra nada - a checagem e a insercao nao sao
atomicas entre si, e so o banco resolve isso.

### Isolamento no SQL

Toda consulta filtra por `user_id` dentro do SQL. Filtrar na aplicacao depois de
ler deixaria a linha de outro usuario sair da tabela, chegar ao processo e
depender de um `if` para nao vazar.

Caso que exigiu atencao: a poda apaga por exclusao ("tudo menos os N mais
recentes"). Se a subconsulta que escolhe os N nao filtrasse por usuario, ela
escolheria os mais recentes da tabela inteira, e a poda de um usuario ativo
apagaria o historico de todos os outros. Ha teste especifico para isso.

### Remocao cruzada responde 404, nao 403

Item de outro usuario e item inexistente produzem resposta identica. Se um
devolvesse 403 e o outro 404, a diferenca contaria ao atacante quais ids existem
na conta alheia.

### Visitante

Historico e favoritos de quem nao tem conta vivem apenas no navegador, em
`src/services/guestCollections.js`. A separacao em relacao a
`collectionsService.js` e deliberada: uma funcao unica que decidisse sozinha
entre banco e `localStorage` seria o lugar exato onde um visitante acabaria
gravando no servidor por engano.

Nao foi implementada migracao automatica do dado local para a conta no login,
conforme instruido. Registrando a opiniao, sem agir sobre ela: se um dia for
desejada, precisa de tela de confirmacao - a pessoa pode ter marcado produtos em
um aparelho emprestado.

## Validacao por mutacao

Oito mutantes, cada um reintroduzindo um defeito especifico. Suite inteira
executada com o defeito presente.

```text
M-I1    listar historico sem filtrar por usuario                    MORTO
M-I2    remover item por id sem conferir o dono                     MORTO
M-I2b   poda escolhendo os mais recentes da tabela inteira          MORTO
M-I3    confiar em userId enviado pelo cliente                      MORTO
M-F3    favoritos sem restricao de unicidade no banco               MORTO
M-A1    guardar o veredito de alergia junto com o historico         MORTO
M-A2a   piso de risco removido: a resposta do modelo vence          MORTO
M-A2b   nao descartar o allergyVerdict vindo do modelo         SOBREVIVEU
```

### O sobrevivente, e por que ele sobreviveu

**M-A2b e um mutante equivalente, e isso foi provado, nao suposto.**

A mutacao troca:

```js
const { allergyVerdict: _fromModel, ...rest } = modelResponse || {};
// por
const { ...rest } = modelResponse || {};
```

Executando as duas versoes lado a lado com uma resposta que tenta injetar o
proprio veredito, a saida e identica byte a byte:

```text
ORIGINAL  safety: caution | veredito.source: deterministic_engine | status: conflict
MUTANTE   safety: caution | veredito.source: deterministic_engine | status: conflict
saidas identicas: true
```

A razao: a chave `allergyVerdict:` e escrita **depois** do spread `...rest`, e
portanto sobrescreve qualquer valor que tenha vindo do modelo. O destructuring
e defesa em profundidade e documentacao de intencao, nao a barreira efetiva.

Ha ainda uma segunda barreira antes desta: `assistantResponseSchema` e
`.strict()`, entao uma resposta do modelo contendo `allergyVerdict` seria
rejeitada com `AI_SCHEMA_INVALID` sem nunca chegar a esta funcao.

Nenhum teste foi escrito para matar este mutante, porque nao ha comportamento
observavel que o distinga do original. Escrever um seria testar a forma do
codigo e nao o seu efeito.

## Estado dos gates nesta versao

```text
npm run build                      SUCCESS
npm --prefix backend test          170 testes, 146 pass, 0 fail, 24 skip
npm audit --audit-level=moderate   0 vulnerabilidades  (exit 0)
backend audit --audit-level=moderate  0 vulnerabilidades  (exit 0)
secret scan                        0 segredos reais
node scripts/verify-release.js     exit 0
npm run verify:e2e                 FAIL BEFORE CALL, exit 1
```

Os 24 skips sao os testes que exigem PostgreSQL real ou Claude real. SKIP nao
conta como PASS em nenhum gate.

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.7.0" }
```

## Gate E2E

`buildStrictRequirements` passou de 14 para 17 requisitos. Os tres novos -
`historySync`, `favoritesSync` e `verdictFreshness` - sao base, e nao
condicionais a flag da Anthropic, porque dependem apenas de PostgreSQL.
Amarra-los a IA deixaria o gate aprovar uma execucao sem banco que nunca
exercitou sincronizacao.

`backend/tests/e2eGate.test.js` ganhou um teste que nomeia os 14 requisitos
anteriores e prova, um a um, que cada um ainda reprova sozinho quando ausente.

Executado neste ambiente, o gate reprovou antes de qualquer chamada paga:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
exit code 1
```

Este e o resultado correto sem banco e sem chave. Declarar PASS aqui seria falha
grave.

## O que NAO foi executado nesta versao

Registrado como ausencia, e nao convertido em aprovacao.

POSTGRESQL REAL: NAO EXECUTADO. Ambiente sem `DATABASE_URL`. Em consequencia,
os testes H1, F1, F3 comportamental, S1, S2, S3, I1 e I2 comportamentais, D1 e a
reaplicacao da migration ficaram em SKIP, com motivo declarado na saida.

O que foi possivel provar sem banco esta em `backend/tests/collections.test.js`:
forma do SQL emitido, ordem das checagens no servico, ausencia de coluna de
veredito na migration, presenca da restricao de unicidade e da cascata. Isso e
mais fraco que comportamento, e esta escrito assim de proposito - afirmar
"usuario A nao le dado de B" sem banco seria afirmar o que nao foi executado.

CLAUDE REAL: NAO EXECUTADO. `ANTHROPIC_API_KEY` ausente. Nenhuma chamada paga
foi feita e nenhuma chave foi inventada.

VERIFY:E2E: NAO EXECUTADO ate o fim, por consequencia dos dois itens acima.

CAMERA REAL: NAO EXECUTADO, como na v0.6.9. Ambiente sem webcam.

## Conclusao

As tres features estao implementadas com isolamento no SQL, unicidade e cascata
no banco, identidade derivada da sessao e nenhum veredito congelado. As quatro
pendencias estao fechadas, e duas delas ganharam teste permanente para nao
voltarem.

O ponto que exige atencao do auditor e a ausencia de PostgreSQL neste ambiente:
a cobertura das features e estrutural, nao comportamental, e a prova de
isolamento entre dois usuarios reais depende de uma execucao com banco.


## Auditoria da v0.6.9

Versao de interface. Nenhuma regra de alergia, autenticacao ou IA foi tocada.

Preservado sem alteracao: `shared/allergenEngine.js`,
`shared/productAllergenAdapter.js`, `shared/allergyVerdict.js`, todo o
`backend/src/ai/`, autenticacao, scrypt, sessoes, schema PostgreSQL e o contrato
publico da API. O veredito deterministico continua sendo campo autoral do
servidor, com as duas barreiras da v0.6.8 intactas.

O que mudou: leitura do codigo de barras, resiliencia da busca na Open Food
Facts, identidade visual da DG Nutricao, escala tipografica, contraste de texto
e linguagem da interface. Detalhe por item no CHANGELOG.

## Por que esta versao existe

Os commits `9622ad8` e `168ae69` foram publicados em producao sob o numero
0.6.8. O `/api/health` passou a anunciar uma versao que nao correspondia ao
codigo em execucao, e sem numero novo nao havia pacote de auditoria - a pasta
`releases/` ficou sem registro dessas duas entregas.

Esta versao encerra a divergencia. Ela nao introduz funcionalidade alem do que
ja estava no ar; ela nomeia o que ja estava no ar.

## D1 - a camera se desligava ao mirar um produto real

### Causa raiz

O callback de leitura em `src/App.jsx` tratava qualquer erro diferente de
`NotFoundException` como falha fatal e chamava `stop()`.

A `@zxing/browser` lanca `ChecksumException` e `FormatException` continuamente
enquanto a pessoa enquadra o codigo - borrado, cortado, com reflexo. Verificado
em `node_modules/@zxing/browser/esm/common/BrowserCodeReader.js`: o laco interno
da propria biblioteca segue tentando nesses tres casos.

Consequencia: apontar a camera para um codigo de barras real era exatamente o
que derrubava o scanner. A tela mostrava "A camera foi interrompida".

### Correcao

`isTransientScanError` passou a reconhecer os tres erros de mira como normais.
Falha real de camera continua sendo fatal.

Verificado no navegador com as classes reais da biblioteca, nao com objetos
sinteticos:

```text
NotFoundException          camera continua ligada
ChecksumException          camera continua ligada
FormatException            camera continua ligada
Error("stream perdido")    camera desliga
```

Alem disso: `decodeFromConstraints` no lugar de `decodeFromVideoDevice`, porque
o segundo ignora resolucao e aceita o padrao da camera (~640x480), onde um
EAN-13 quase nao tem pixel por barra. A camera passou a ser pedida com
1920x1080 ideal e foco continuo, e o intervalo entre tentativas caiu de 500ms
(padrao da biblioteca) para 100ms.

### Confirmacao por leitura dupla

`src/utils/barcodeConfirm.js`, novo. Exige a mesma leitura duas vezes seguidas
antes de aceitar o codigo. Custa cerca de 100ms e evita abrir o produto errado,
que num app de alergia e informacao de seguranca errada na tela.

## D2 - busca de produtos falhava sem retentativa

Medicao contra a API publica em 04/09/2026: `/api/v2/search` respondia 503 em
cerca de metade das chamadas. A resposta de erro nao traz cabecalho CORS, entao
no navegador a falha chega como erro de CORS. Sem retentativa, uma falha virava
"nao encontrei" com a base no ar.

Os tempos foram calibrados por medicao no navegador, nao por estimativa:

```text
/api/v2/search   falha em ~7,8s quando esta fora
/cgi/search.pl   responde em ~0,8s
```

Por isso o endpoint principal nao ganha retentativa - o reserva chega antes de
uma segunda tentativa terminar. Tres tentativas no principal deixavam a tela
parada em "Procurando..." por mais de 20s.

Evidencia da correcao agindo, colhida do console do navegador: no termo
"queijo", o endpoint principal E a primeira tentativa do reserva foram
bloqueados, e a retentativa salvou a busca. Nos quatro termos medidos, o codigo
anterior teria falhado.

## D3 - a paleta contradizia a propria logo

`src/styles.css` trazia o comentario "cor tirada da logo" e usava
`--lime: #a8cc3b`. As cores foram medidas nos pixels do arquivo entregue
(`src/assets/dg-nutricao.jpg`, 1254x1254): oliva `#5b6a43` e salvia `#859373`.
Verde-limao nao existe no arquivo.

Restricao que acompanha a paleta, medida antes de aplicar: o salvia marca
3.27:1 sobre branco e reprova para texto. Ele so aparece em borda, fundo e
desenho; texto e icone usam o oliva (5.94:1) ou os tons de tinta.

## D4 - escala tipografica pequena demais para o publico

51 dos 58 tamanhos de fonte estavam abaixo de 16px, tres deles em 11px,
espalhados como valores soltos por 1.662 linhas de CSS. O publico declarado do
produto tem idade avancada e le rotulo para decidir sobre alergia.

```text
menor texto do app   11px -> 15px
texto corrido        15px -> 20px
alvo de toque        36px -> 48px
contraste do texto   12.8:1, 7.2:1, 4.9:1  ->  16.9:1, 11.1:1, 7.6:1
```

Dois defeitos que a fonte maior expos e que foram corrigidos junto: a faixa de
alergia da tela inicial esmagava o icone de 20px para 7px, e em 320px a pagina
passou a rolar lateralmente, porque coluna de grid nao encolhe abaixo do
conteudo minimo e `<input>` e `<video>` tem largura natural propria (256px e
300px).

## Verificacao de interface por medicao

Auditoria automatizada sobre o que esta renderizado - cor computada de cada
elemento contra o fundo real herdado, e comparacao de `scrollWidth` com
`clientWidth` para detectar estouro.

```text
320px    7 telas   0 estouros   0 rolagem lateral
375px    7 telas   0 reprovacoes de contraste   menor fonte 15px
1360px   7 telas   0 reprovacoes de contraste   menor fonte 16px
```

Correcao de um erro de metodo desta auditoria: as primeiras execucoes usaram os
hashes `#inicio` e `#assistente`. Os identificadores reais do app sao `home` e
`chat`, e como ele ignora hash invalido em vez de redirecionar, essas duas
voltas do laco ficavam na tela anterior - a tela do Assistente nunca era
auditada e a de Alergias era contada duas vezes. Refeito com os sete
identificadores corretos; o Assistente passou sem reprovacao.

## Dependencias

`npm audit fix` no frontend resolveu um aviso `high` em `browserslist` e um
`moderate` em `baseline-browser-mapping`, dependencia transitiva de build via
`@vitejs/plugin-react` -> `@babel/core`. O aviso e anterior a esta versao e
travava o `verify-release.js`.

Conferido que a troca nao alterou o produto: o build sai com os mesmos hashes de
asset de antes da correcao.

## Estado dos gates nesta versao

```text
npm run build                      SUCCESS
npm --prefix backend test          124 testes, 118 pass, 0 fail, 6 skip
npm audit --audit-level=high       0 vulnerabilidades  (exit 0)
backend audit --audit-level=high   0 vulnerabilidades  (exit 0)
secret scan                        0 segredos reais
node scripts/verify-release.js     exit 0
verify:e2e                         NAO EXECUTADO
```

Os 6 testes pulados sao os destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o de integracao real da Anthropic. SKIP
nao conta como PASS.

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.7.0" }
```

## O que NAO foi executado nesta versao

Registrado como ausencia, e nao convertido em aprovacao.

CAMERA REAL: NAO EXECUTADO. Esta e a ausencia mais relevante do pacote. O
defeito D1 e sobre leitura de codigo de barras, e o ambiente de trabalho nao tem
webcam. A logica esta coberta por 10 testes e foi verificada no navegador com as
classes reais da `@zxing/library`, mas ninguem apontou um telefone para uma
embalagem. A resolucao pedida, o foco continuo e o ganho de velocidade de
leitura sao, hoje, mudancas fundamentadas e nao mudancas comprovadas em campo.

POSTGRESQL REAL: NAO EXECUTADO. Ambiente sem `DATABASE_URL`.

CLAUDE REAL: NAO EXECUTADO. `ANTHROPIC_API_KEY` ausente e
`RUN_ANTHROPIC_INTEGRATION_TESTS` desabilitado. Nenhuma chamada paga foi feita e
nenhuma chave foi inventada.

VERIFY:E2E: NAO EXECUTADO, por consequencia dos dois itens acima. O PASS
registrado no E2E_REPORT da v0.6.8 pertence aquela versao e aquela execucao; ele
nao foi herdado aqui.

Esta versao nao toca em banco, sessao nem IA, entao a ausencia desses gates nao
esconde risco nas areas alteradas. Ela significa que a cobertura desta entrega e
de interface, e nao de integracao.

## Conclusao

Os quatro defeitos desta versao estao corrigidos e verificados por execucao de
comando e por medicao no navegador. O contrato publico da API nao mudou e o
motor deterministico de alergia sai identico.

O ponto que exige atencao do auditor e a camera: e a correcao central da versao
e a unica sem prova em dispositivo real.

## Auditoria externa independente da v0.6.7 e correcoes da v0.6.8

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
