# E2E Report - NutriVa v0.6.9

Data: 2026-09-18

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

## Historico de auditorias anteriores

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
