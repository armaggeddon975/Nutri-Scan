# E2E Report - NutriVa v0.6.8

Data: 2026-08-27

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
