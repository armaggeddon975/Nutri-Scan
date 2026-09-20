# E2E Report - NutriScan v0.7.1

Data: 2026-09-20

## Resultado geral

```text
PostgreSQL real:      EXECUTADO  - PostgreSQL 17.10, porta 5433
integracao (18):      EXECUTADO  - 18 pass, 0 fail, 0 skip
e2e:real:             EXECUTADO  - ok: true
verify-release:       EXECUTADO  - OK
verify:e2e:           FAIL BEFORE CALL (exit 1) - sem ANTHROPIC_API_KEY
Claude real:          NAO EXECUTADO - sem ANTHROPIC_API_KEY
camera real:          NAO EXECUTADO - exige hardware
```

`verify:e2e` reprovou, e isso esta certo. Ele exige chamada real a Claude, e
recusa ANTES de gastar dinheiro:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
[INFO] como habilitar - RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

Um gate bloqueado por ambiente para o trabalho e e reportado. **Ele nao vira
aprovacao.** Esta versao nao afirma ter passado no gate E2E completo.

Esta e a primeira versao em que a suite de integracao roda inteira contra um
banco real. Na v0.7.0 ela nunca rodou: sem banco ficava em SKIP, e com banco
falhava por quota do limitador. Era exatamente o defeito D1.

Nenhum resultado foi herdado de versao anterior. Nenhuma credencial foi
inventada e nenhuma chamada paga foi feita.

## Ambiente

O ambiente de trabalho nao tem Docker nem permissao de administrador, e o
caminho do projeto tem acento - `Área de Trabalho` -, o que faz o `initdb`
recusar com `invalid byte sequence for encoding "UTF8": 0xc1 0x72`. A saida foi
instalar os binarios do PostgreSQL 17.10 fora do caminho acentuado:

```text
binarios   C:\Users\diego\AppData\Local\nutriscan-pg
dados      C:\Users\diego\AppData\Local\nutriscan-pgdata
porta      5433
```

```text
DATABASE_URL=postgresql://nutriscan:nutriscan_dev@localhost:5433/nutriscan
DATABASE_SSL=false
RUN_DB_INTEGRATION_TESTS=true
```

`scripts/dev-db.js` sobe um cluster local para quem quiser reproduzir, e aceita
`DEV_DB_DATA_DIR` para desviar do caminho acentuado.

## Suite de integracao - antes e depois da correcao

ANTES:

```text
ℹ tests 18
ℹ pass 9
ℹ fail 9
```

Primeira falha em F4, e dali em diante sempre a mesma causa:

```text
SyntaxError: Unexpected token 'T', "Too many r"... is not valid JSON
```

DEPOIS:

```text
✔ H1 o historico grava e devolve o item gravado
✔ F1 favoritar e desfavoritar altera apenas a conta que pediu
✔ H2 consultar o mesmo produto de novo atualiza a linha, sem duplicar
✔ H3 o limite de historico e aplicado pela poda mais antiga
✔ H4 limpar o historico nao toca nos favoritos
✔ F2 favoritar o mesmo produto duas vezes nao cria duas linhas
✔ F3 o toggle devolve o estado resultante
✔ F4 o limite de favoritos e aplicado e devolve erro, sem podar (3464.6631ms)
✔ S1 a leitura reflete escrita de outro dispositivo da mesma conta
✔ S2 remocao em um dispositivo some no outro
✔ S3 a ultima escrita vence pelo relogio do servidor
✔ I1 usuario A nao le historico nem favorito de B
✔ I2 usuario B nao remove item de A
✔ I3 userId no corpo da requisicao e ignorado; vale a sessao
✔ I4 e V1 sem sessao valida todas as rotas novas respondem 401
✔ A1 o item salvo nao guarda veredito de alergia
✔ D1 a cota de um usuario nao esgota a cota de outro
✔ a migration aplica e reaplica sem quebrar
ℹ tests 18
ℹ pass 18
ℹ fail 0
ℹ skipped 0
```

**Zero SKIP.** I1, I2 e I3 rodaram e passaram pela primeira vez.

## e2e:real contra PostgreSQL real

```text
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] assistant guest - AI_NOT_CONFIGURED conforme esperado
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] assistant authenticated - rota autenticada alcancada, AI_NOT_CONFIGURED
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] history sync - A gravou, B leu, conta isolada nao viu
[OK] favorites sync - A gravou, B leu, remocao cruzada recusada com 404
[OK] verdict freshness - item salvo sem veredito; perfil muda sem alterar o registro
[OK] auth - register, me, allergies, login, logout idempotente
```

```json
{
  "version": "0.7.1",
  "mode": "normal",
  "baseUrl": "http://127.0.0.1:3000/api",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "historySync": "PASSED",
  "favoritesSync": "PASSED",
  "verdictFreshness": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "AI_NOT_CONFIGURED",
  "assistantAuthenticated": "AI_NOT_CONFIGURED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "not_configured",
  "anthropicReal": "NOT_EXECUTED",
  "anthropicCalls": 0,
  "ok": true
}
```

`mode: normal`, e nao `strict`: o modo strict exige `anthropicReal` e
`assistantAuthenticated`, que dependem de uma chave real e de uma chamada paga.
Sem a chave, `npm run e2e:strict` reprova - e esse e o comportamento correto.
**A execucao em modo normal nao substitui a strict e nao e apresentada como
tal.**

## Orcamento de limite medido na execucao

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

Nenhum limitador foi encostado. A margem de 50% existe para que um teste novo
nao descubra o teto do jeito ruim, que foi como a v0.7.0 descobriu.

## Suite completa do backend

```text
ℹ tests 179
ℹ pass 178
ℹ fail 0
ℹ skipped 1
ℹ todo 0
ℹ duration_ms 56362.9663
```

O unico SKIP, com a propria declaracao:

```text
﹣ Claude real responde pergunta curta quando explicitamente habilitado
  # NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

E a protecao contra chamada paga acidental. **NAO EXECUTADO nao e PASS.**

## Validacao por mutacao

```text
mortas 8 | nao executadas 0 | problemas 0
APROVADO: toda mutacao foi detectada pelo teste correspondente.
```

Detalhe por mutacao no AUDIT_REPORT, incluindo a que sobreviveu na primeira
rodada e obrigou a refazer um teste.

## Build

```text
npm run build   ✓ built in 15.40s
```

## O que NAO foi executado

```text
Claude real (chamada paga)     NAO EXECUTADO - sem ANTHROPIC_API_KEY
npm run verify:e2e             FAIL BEFORE CALL (exit 1) - depende da chave acima
npm run e2e:strict             NAO EXECUTADO - depende da chave acima
camera real em aparelho        NAO EXECUTADO - exige hardware
Neon em producao               NAO EXECUTADO - testado contra PostgreSQL 17.10 local
carga simultanea real          NAO EXECUTADO - o limitador foi provado em processo
```

Nenhum destes foi contornado, simulado ou declarado como aprovado.

## Historico de auditorias anteriores

## E2E da v0.7.0 - 2026-09-18

## Resultado geral

```text
PostgreSQL real: NAO EXECUTADO
Claude real:     NAO EXECUTADO
verify:e2e:      FAIL BEFORE CALL (exit 1)
camera real:     NAO EXECUTADO
```

Nenhum resultado foi herdado de versao anterior. O PASS de `verify:e2e`
registrado na v0.6.8, em 2026-08-27, esta preservado na secao historica no fim
deste documento e nao vale para esta versao.

Nenhuma credencial foi inventada e nenhuma chamada paga foi feita.

## Por que o gate reprovou, e por que isso esta certo

```text
DATABASE_URL                        ausente no ambiente de trabalho
ANTHROPIC_API_KEY                   ausente
RUN_ANTHROPIC_INTEGRATION_TESTS     desabilitado
webcam                              inexistente na maquina
```

Saida literal:

```text
[FAIL] verify:e2e - RUN_ANTHROPIC_INTEGRATION_TESTS=true e obrigatorio no gate
E2E completo. FAIL BEFORE CALL: nenhuma chamada paga foi feita.
[INFO] como habilitar - RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
exit code 1
```

O gate e fail-closed: sem banco e sem chave ele reprova **antes** de subir
qualquer etapa. Esse e o comportamento correto. Forcar um PASS aqui exigiria
fabricar credencial, o que o projeto proibe.

## Subgates do modo strict

O runner foi executado direto (`npm run e2e:strict`) para registrar o estado de
cada subgate. Saida real do relatorio:

| Subgate | Estado | Motivo |
|---|---|---|
| `backendProcess` | NOT_EXECUTED | runner abortou antes de subir a API |
| `database` | NOT_EXECUTED | `DATABASE_URL` ausente |
| `migrations` | NOT_EXECUTED | depende do banco |
| `auth` | NOT_EXECUTED | depende do banco |
| `sessionSchema` | NOT_EXECUTED | depende do banco |
| `multiDevice` | NOT_EXECUTED | depende do banco |
| `isolation` | NOT_EXECUTED | depende do banco |
| **`historySync`** | **NOT_EXECUTED** | subgate novo, depende do banco |
| **`favoritesSync`** | **NOT_EXECUTED** | subgate novo, depende do banco |
| **`verdictFreshness`** | **NOT_EXECUTED** | subgate novo, depende do banco |
| `logout` | NOT_EXECUTED | depende do banco |
| `deterministicEngine` | NOT_EXECUTED | runner abortou antes |
| `assistantGuest` | NOT_EXECUTED | depende da chave |
| `assistantAuthenticated` | NOT_EXECUTED | depende da chave |
| `assistantAuthority` | NOT_EXECUTED | depende do banco e da chave |
| `fallback` | NOT_EXECUTED | runner abortou antes |
| `privacy` | NOT_EXECUTED | runner abortou antes |
| `anthropicReal` | NOT_EXECUTED | chave ausente, `anthropicCalls: 0` |
| **`ok`** | **false** | |

```text
[FAIL] E2E real - DATABASE_URL nao configurada; modo strict exige PostgreSQL real
exit code 1
```

Nenhum subgate em SKIP foi contado como PASS.

## Os tres subgates novos

Sao separados de proposito. Um unico subgate "colecoes" esconderia qual das tres
promessas quebrou, e o auditor precisa saber se o problema foi sincronizar,
isolar ou recalcular.

```text
historySync        A grava historico, B le, conta isolada nao ve
favoritesSync      o mesmo para favoritos, mais remocao cruzada recusada com 404
verdictFreshness   item salvo sem veredito; mudar o perfil nao altera o registro
```

Sao requisitos BASE em `buildStrictRequirements`, e nao condicionais a flag da
Anthropic: dependem apenas de PostgreSQL. Amarra-los a IA deixaria o gate
aprovar uma execucao sem banco que nunca exercitou sincronizacao.

## Requisitos do modo strict: 14 para 17

Nenhum requisito anterior foi perdido. `backend/tests/e2eGate.test.js` nomeia os
14 que existiam antes desta versao e prova, um a um, que cada um ainda reprova
sozinho quando ausente:

```text
✔ A12: os 14 requisitos anteriores a v0.7.0 continuam exigidos, um a um
✔ A12: os tres requisitos novos tambem reprovam sozinhos
✔ D2: o conjunto de requisitos do modo strict e exatamente este
```

## O que foi executado

### Build

```bash
npm run build
```

SUCCESS.

### Testes

```bash
npm --prefix backend test
```

```text
total   170
passed  146
failed  0
skipped 24
```

Os 24 pulados sao os que exigem PostgreSQL real ou Claude real, cada um com
motivo declarado na saida:

```text
NAO EXECUTADO - PostgreSQL nao disponivel
NAO EXECUTADO - defina RUN_ANTHROPIC_INTEGRATION_TESTS=true e ANTHROPIC_API_KEY
```

SKIP nao conta como PASS.

Testes novos desta versao:

```text
backend/tests/collections.test.js             forma do SQL, servicos, migration
backend/tests/collectionsIntegration.test.js  comportamento com banco real (SKIP aqui)
backend/tests/productName.test.js             P1t, residuo de nome
backend/tests/auditThreshold.test.js          P2t, limiar do gate de audit
backend/tests/e2eGate.test.js                 A12, os 14 requisitos antigos
```

### Auditoria de dependencias

```text
npm audit --audit-level=moderate                  0 vulnerabilidades, exit 0
npm --prefix backend audit --audit-level=moderate 0 vulnerabilidades, exit 0
secret scan                                       0 segredos reais
```

Antes da correcao, o backend tinha tres avisos moderate em `qs`. Saida literal
antes e depois esta no AUDIT_REPORT.

### verify:release

```text
[OK] doctor
[OK] frontend build
[OK] backend tests
[OK] frontend audit
[OK] backend audit
[OK] secret scan - 0 real secrets
[OK] release verification
exit code 0
```

### Validacao por mutacao

Oito mutantes, sete mortos, um sobrevivente **provado equivalente** com execucao
lado a lado. Detalhe e prova no AUDIT_REPORT.

### Visitante, verificado no navegador

Com a interface rodando, um visitante abriu um produto e favoritou. A lista de
requisicoes de rede mostra apenas `GET /api/auth/me`; **nenhuma** chamada a
`/api/history` ou `/api/favorites`. Os dois itens ficaram em `localStorage`, um
em cada chave.

Isso e V1 verificado por execucao, e nao apenas por leitura de codigo.

### version:check

```text
node scripts/version-check.js https://nutriscan-h1wp.onrender.com
[FAIL] version:check - repositorio declara 0.7.0 e o deploy anuncia 0.6.8
exit code 1
```

A ferramenta encontrou a divergencia real que motivou a pendencia P4.

## Gates

| Item | Resultado |
|---|---|
| Frontend build | PASS |
| Backend tests | PASS |
| npm audit frontend (moderate) | PASS |
| npm audit backend (moderate) | PASS |
| Secret scan | PASS |
| verify:release | PASS |
| P1t residuo de nome | PASS |
| P2t limiar do gate de audit | PASS |
| A12 os 14 requisitos antigos | PASS |
| Mutacao I1, I2, I3, F3, A1, A2 | PASS (1 equivalente reportado) |
| V1 visitante nao grava no banco | PASS (verificado no navegador) |
| version:check | PASS (detectou divergencia real) |
| PostgreSQL real | NAO EXECUTADO |
| Claude real | NAO EXECUTADO |
| verify:e2e | FAIL BEFORE CALL |
| historySync / favoritesSync / verdictFreshness | NAO EXECUTADO |
| Leitura em camera fisica | NAO EXECUTADO |

## O que NAO foi comprovado neste ambiente

```text
PostgreSQL real        sem DATABASE_URL; H1, F1, F3, S1-S3, I1, I2, D1 em SKIP
Claude real            sem ANTHROPIC_API_KEY
Camera fisica          sem webcam
Docker e WSL           ausentes; opcionais
Carga e concorrencia   fora do escopo
```

A ausencia mais relevante desta versao e o PostgreSQL. As features entregues
sao, por natureza, sobre persistencia e isolamento entre usuarios: o que foi
provado aqui e a forma do SQL e a ordem das decisoes no servico, nao o
comportamento contra um banco de verdade. A bateria comportamental existe,
esta escrita e SKIPa com motivo - ela roda inteira assim que houver
`DATABASE_URL` e `RUN_DB_INTEGRATION_TESTS=true`.


### Execucao da v0.6.9 - 2026-09-18

## Resultado geral

```text
PostgreSQL real: NAO EXECUTADO
Claude real:     NAO EXECUTADO
verify:e2e:      NAO EXECUTADO
camera real:     NAO EXECUTADO
```

Nenhum desses resultados foi herdado da versao anterior. O PASS de `verify:e2e`
registrado na v0.6.8 pertence aquela execucao, em 2026-08-27, e esta preservado
na secao historica no fim deste documento.

Nenhuma credencial foi inventada e nenhuma chamada paga foi feita.

## Por que nao foi executado

```text
DATABASE_URL                        ausente no ambiente de trabalho
ANTHROPIC_API_KEY                   ausente
RUN_ANTHROPIC_INTEGRATION_TESTS     desabilitado
webcam                              inexistente na maquina
```

`verify:e2e` exige PostgreSQL real e Claude real. Sem os dois, o gate reprova
antes de subir qualquer etapa - e reprovar e o comportamento correto dele.
Forcar um PASS aqui exigiria fabricar credencial, o que o projeto proibe.

## O que esta versao mudou, e o que isso implica

A v0.6.9 e uma versao de interface. Ela nao toca em banco, sessao,
autenticacao, motor de alergia nem camada de IA. As areas que `verify:e2e`
exercita saem identicas da v0.6.8.

Isso nao transforma a ausencia em aprovacao. Significa apenas que a lacuna esta
em integracao, e nao nas areas alteradas.

## O que foi executado

### Build

```bash
npm run build
```

SUCCESS. A logo entra no pacote como `dg-nutricao-BXAUdiut.jpg`, 71 KB, e o
simbolo como `dg-simbolo.png`, 36 KB.

### Testes

```bash
npm --prefix backend test
```

```text
total   124
passed  118
failed  0
skipped 6
```

Dezenove testes novos nesta versao:

```text
backend/tests/scannerReliability.test.js       10 testes
backend/tests/openFoodFactsResilience.test.js   9 testes
```

Os 10 de scanner cobrem o defeito D1: erro transitorio de mira nao pode derrubar
a camera, falha real continua fatal, a camera e pedida com resolucao alta e foco
continuo, e a confirmacao exige duas leituras iguais. Um deles carrega as
classes reais da `@zxing/library` e se declara SKIP com mensagem
`NAO EXECUTADO` quando so o backend foi instalado - ambiente ausente e
reportado, nao contornado.

Os 9 de Open Food Facts cobrem D2: retentativa em 503, queda para o endpoint
reserva, ausencia de retentativa no endpoint lento, e 404 respondido na primeira
tentativa por ser resposta definitiva.

Os 6 pulados sao os destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o de integracao real da Anthropic. SKIP
nao conta como PASS.

### Auditoria de dependencias

```text
npm audit --audit-level=high                  0 vulnerabilidades, exit 0
npm --prefix backend audit --audit-level=high 0 vulnerabilidades, exit 0
secret scan                                   0 segredos reais
```

O aviso `high` em `browserslist`, anterior a esta versao, foi resolvido com
`npm audit fix`. O build sai com os mesmos hashes de asset depois da troca.

### Medicao de interface no navegador

Auditoria sobre o que esta renderizado: cor computada de cada elemento contra o
fundo real herdado, e `scrollWidth` contra `clientWidth` para detectar estouro.

```text
320px    7 telas   0 estouros   0 rolagem lateral
375px    7 telas   0 reprovacoes de contraste   menor fonte 15px
1360px   7 telas   0 reprovacoes de contraste   menor fonte 16px
```

### Verificacao funcional contra servicos reais

Executada no site publicado, contra o backend em producao e a API publica da
Open Food Facts:

```text
codigo 7891000100103   produto carregado em 1,0s
busca "iogurte"        resultado em 1,0s
busca "cafe"           11 resultados em 1,0s
busca "bolacha"        11 resultados em 3,3s
```

Antes da correcao D2, a busca por nome falhava em cerca de metade das
tentativas. Seis termos medidos depois da correcao retornaram resultado, entre
1,0s e 3,3s.

### Erros transitorios da camera, com as classes reais

Executado no navegador, importando `@zxing/library` de verdade:

```text
NotFoundException          camera continua ligada
ChecksumException          camera continua ligada
FormatException            camera continua ligada
Error("stream perdido")    camera desliga
```

## Gates

| Item | Resultado |
|---|---|
| Frontend build | PASS |
| Backend tests | PASS |
| npm audit frontend | PASS |
| npm audit backend | PASS |
| Secret scan | PASS |
| verify:release | PASS |
| Contraste e estouro em 3 larguras | PASS |
| Consulta por codigo contra backend real | PASS |
| Busca por nome contra Open Food Facts real | PASS |
| Erros transitorios com classes reais do ZXing | PASS |
| PostgreSQL real | NAO EXECUTADO |
| Claude real | NAO EXECUTADO |
| verify:e2e | NAO EXECUTADO |
| Leitura em camera fisica | NAO EXECUTADO |

## O que NAO foi comprovado neste ambiente

```text
Camera fisica          sem webcam; e a correcao central desta versao
PostgreSQL real        sem DATABASE_URL
Claude real            sem ANTHROPIC_API_KEY
Docker e WSL           ausentes; opcionais, nao exigidos por nenhum gate
Carga e concorrencia   fora do escopo desta versao
Navegadores reais      medicao feita em um unico motor
```

A camera merece destaque: o defeito D1 e sobre leitura de codigo de barras e
nenhuma das verificacoes acima toca em hardware de camera. E o unico item desta
entrega que so pode ser fechado com um telefone na mao.

### Execucao da v0.6.8 - 2026-08-27

Preservada como registro. Os numeros e estados abaixo sao daquela versao.

## Resultado geral

```text
PostgreSQL real: EXECUTADO (Neon, sa-east-1)
Claude real:     EXECUTADO (2 chamadas)
verify:e2e:      PASS
```

Este e o primeiro relatorio do projeto em que `verify:e2e` termina em PASS. Nas
versoes anteriores ele ficou BLOCKED por ambiente, e isso foi registrado como
`NAO EXECUTADO` em vez de aprovado.

Nenhuma credencial foi inventada.

## Ambiente

- Sistema: Windows 11.
- Node.js: 24.15.0 / npm: 11.12.1.
- SDK de IA: `@anthropic-ai/sdk` 0.117.1.
- `DATABASE_URL`: configurada, PostgreSQL gerenciado (Neon).
- `ANTHROPIC_API_KEY`: configurada, somente no backend.
- `RUN_ANTHROPIC_INTEGRATION_TESTS`: habilitado apenas nesta execucao.
- `RUN_DB_INTEGRATION_TESTS`: desabilitado (padrao). Os testes destrutivos de
  banco continuam SKIP em `npm test`.
- Docker e distro WSL: ausentes (opcionais).

## verify:e2e

```bash
RUN_ANTHROPIC_INTEGRATION_TESTS=true npm run verify:e2e
```

Exit code 0.

```text
[OK] doctor:e2e
[OK] migrations - aplicadas duas vezes (idempotente)
[RUN] backend - iniciando API temporaria na porta 3000
[OK] health - status=ok database=connected ai=configured
[OK] deterministic engine - contains/traces conforme baseline
[OK] privacy - payload sem segredos e com snapshot deterministico
[OK] anthropic real #1 - pergunta generica validada
[OK] fallback - AI_NOT_CONFIGURED -> source local
[OK] session schema - token_hash presente e sem coluna de token bruto
[OK] assistant authority - PostgreSQL vence guestAllergies e snapshot marca conflito
[OK] anthropic real #2 - produto com conflito validado com sessao autenticada
[OK] multi-device - alergias sincronizadas entre dispositivos A e B
[OK] isolation - contas permanecem isoladas
[OK] auth - register, me, allergies, login, logout idempotente
[OK] e2e:strict
[PASS] verify:e2e - PostgreSQL real e Claude real comprovados
```

```json
{
  "version": "0.6.8",
  "mode": "strict",
  "startedAt": "2026-08-27T20:30:09.082Z",
  "finishedAt": "2026-08-27T20:30:23.594Z",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "EXECUTED",
  "migrations": "EXECUTED_IDEMPOTENT",
  "auth": "PASSED",
  "sessionSchema": "PASSED",
  "multiDevice": "PASSED",
  "isolation": "PASSED",
  "logout": "PASSED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "PASSED",
  "assistantAuthenticated": "PASSED",
  "assistantAuthority": "PASSED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "configured",
  "anthropicReal": "EXECUTED_GENERIC_AND_PRODUCT",
  "anthropicCalls": 2,
  "ok": true
}
```

Limpeza conferida direto no banco depois da execucao: `usuarios totais: 1`
(a conta real do dono do projeto), `residuo de teste: 0`.

## B2 - diagnostico por execucao

Cenario da auditoria externa reproduzido aqui: PostgreSQL real, migrations
aplicadas, `ANTHROPIC_API_KEY` falsa e `RUN_ANTHROPIC_INTEGRATION_TESTS=true`.

Antes da v0.6.8, o runner abortava na primeira chamada Anthropic e o relatorio
saia com `database: NOT_EXECUTED` mesmo com o banco acessivel.

Depois:

```text
[OK]   migrations, health, deterministic engine, privacy
[WARN] assistant guest - adiado - chamada real da Anthropic (visitante) falhou
[OK]   fallback, session schema, assistant authority
[WARN] assistant authenticated - adiado - chamada real da Anthropic falhou
[OK]   multi-device, isolation, auth
[FAIL] E2E real - falha em etapa dependente da IA: assistant guest ... | assistant authenticated ...
```

```text
database        EXECUTED       (era NOT_EXECUTED)
auth            PASSED
sessionSchema   PASSED
multiDevice     PASSED
isolation       PASSED
logout          PASSED
assistantGuest  NOT_EXECUTED
anthropicReal   NOT_EXECUTED
ok              false
```

O gate continua reprovando. Adiar a falha serve para diagnostico e nunca para
transformar FAIL em PASS: `deferredFailures` e relancado antes de `report.ok` e
antes da avaliacao strict.

## Exploit C1

Reproduzido antes da correcao e bloqueado depois. Saidas completas no
AUDIT_REPORT.

```text
antes   safety "normal", sem veredito         -> falso seguro entregue
depois  safety "caution", veredito do motor   -> exploit bloqueado
```

## Gates

| Item | Resultado |
|---|---|
| Veredito deterministico autoral do servidor | PASS |
| Piso de risco com conflito declarado | PASS |
| Schema `.strict()` rejeita campo do modelo | PASS |
| Interface mostra o veredito acima do texto | PASS |
| Veredito sem IA (fallback) | PASS |
| Autoridade do perfil (PostgreSQL vence request) | PASS |
| Privacidade do payload | PASS |
| Migrations idempotentes | PASS |
| Sessao com `token_hash` e sem token bruto | PASS |
| Multi-dispositivo e isolamento entre contas | PASS |
| Logout idempotente | PASS |
| Claude real, 2 chamadas | PASS |
| Doctor normal e strict | PASS |
| Frontend build | PASS |
| Backend tests | PASS |
| npm audits | PASS |
| Secret scan | PASS |
| **verify:e2e** | **PASS** |

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
total   104
passed  98
failed  0
skipped 6
```

Os 6 pulados sao os testes destrutivos de banco, que exigem
`RUN_DB_INTEGRATION_TESTS=true`, mais o teste de integracao real da Anthropic.
SKIP nao conta como PASS.

## Audits e secret scan

```text
npm audit --audit-level=high                  0 vulnerabilidades
npm --prefix backend audit --audit-level=high 0 vulnerabilidades
secret scan                                   0 segredos reais
```

## Varredura OpenAI

Nenhuma ocorrencia executavel nova. As que permanecem sao intencionais e estao
descritas no AUDIT_REPORT: testes de regressao que provam a ausencia da flag
antiga, o padrao de secret scan da chave antiga, e o registro historico no
CHANGELOG e nos documentos de arquitetura.

## O que NAO foi comprovado neste ambiente

```text
Docker e WSL           ausentes; opcionais, nao exigidos por nenhum gate
Carga e concorrencia   fora do escopo desta versao
Navegadores reais      T7 renderiza o componente no servidor, nao em browser
```
