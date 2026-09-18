# Relatorio de Auditoria - NutriScan v0.7.0

Data: 2026-09-18

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

## Historico de auditorias anteriores

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
