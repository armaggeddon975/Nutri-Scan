# E2E Report - NutriScan v0.6.6

Data: 2026-08-15

## Resultado geral

```text
Migracao OpenAI -> Anthropic: CONCLUIDA
PostgreSQL real: NAO EXECUTADO
Claude real: NAO EXECUTADO
verify:e2e: BLOCKED (ambiente sem PostgreSQL e sem ANTHROPIC_API_KEY)
```

Nenhuma credencial foi inventada e nenhuma chamada paga foi feita.

## Ambiente

- Sistema: Windows 11.
- Node.js: 24.15.0 / npm: 11.12.1.
- SDK de IA: `@anthropic-ai/sdk` 0.117.1.
- `DATABASE_URL`: NAO CONFIGURADA.
- `ANTHROPIC_API_KEY`: NAO CONFIGURADA.
- `RUN_ANTHROPIC_INTEGRATION_TESTS`: desabilitado.
- PostgreSQL, Docker e distro WSL: ausentes.

## Gates

| Item | Resultado |
|---|---|
| Migracao do SDK | PASS |
| Mapeamento de erro com instancias REAIS do SDK | PASS, corrigido na v0.6.4 |
| Guarda fail-closed de `stop_reason` | PASS, corrigido na v0.6.4 |
| Messages API | PASS, coberto por mock |
| Structured Outputs + Zod | PASS |
| Tratamento de `stop_reason` | PASS |
| Leitura de content blocks | PASS |
| Codigos de erro neutros | PASS |
| Motor deterministico | PASS |
| Autoridade do perfil | PASS |
| Privacidade do payload | PASS |
| Fallback local | PASS |
| Health com `aiProvider` | PASS |
| Doctor normal | PASS |
| Doctor strict | FAIL, por ambiente |
| PostgreSQL real | NAO EXECUTADO |
| Migrations, register, login, auth/me | NAO EXECUTADO |
| Alergias, multi-dispositivo, isolamento, sessao, logout | NAO EXECUTADO |
| Assistente autenticado por HTTP | NAO EXECUTADO |
| Claude real | NAO EXECUTADO |
| Frontend build | PASS |
| Backend tests | PASS |
| npm audits | PASS |
| Secret scan | PASS |
| **verify:e2e** | **BLOCKED** por ambiente |

## Doctor

```bash
npm run doctor
```

Exit code 0. Trecho relevante da migracao:

```text
[OK]   Backend dependencies - installed (4 modules resolved)
[WARN] ANTHROPIC_API_KEY - not_configured
[OK]   ANTHROPIC_MODEL - claude-sonnet-5
[OK]   RUN_ANTHROPIC_INTEGRATION_TESTS - disabled
```

O modulo obrigatorio do backend agora e `@anthropic-ai/sdk`. Nenhum valor de
chave foi impresso.

`npm run doctor:e2e` continua exit code 1, agora exigindo `ANTHROPIC_API_KEY` no
lugar de `OPENAI_API_KEY`.

## E2E executado

```bash
npm run e2e:real
```

Exit code 0. O runner subiu a API temporaria, validou o possivel e encerrou.

```json
{
  "version": "0.6.6",
  "backendProcess": "STARTED_BY_RUNNER",
  "database": "NOT_EXECUTED",
  "deterministicEngine": "PASSED",
  "assistantGuest": "AI_NOT_CONFIGURED",
  "fallback": "PASSED",
  "privacy": "PASSED",
  "anthropic": "not_configured",
  "anthropicReal": "NOT_EXECUTED"
}
```

O check de privacidade e a prova pratica da migracao: ele injeta um mock de
`client.messages.create` e o servico chama exatamente esse metodo. Se o backend
ainda estivesse na API antiga, esse passo falharia.

## Health

```text
GET /api/health -> 200
status      ok
database    not_configured
ai          not_configured
aiProvider  anthropic
version     0.6.6
```

## Assistente

VISITANTE: EXECUTADO. `POST /api/assistant/chat` retornou `AI_NOT_CONFIGURED`,
como esperado sem chave.

AUTENTICADO POR HTTP: NAO EXECUTADO, depende de PostgreSQL.

AUTORIDADE DO PERFIL: EXECUTADO por teste automatizado com mock da Messages API:

```text
conta ["milk"] + request guestAllergies ["soy"]
-> profileAllergies ["milk"]
-> hasDeclaredConflict true
```

## Claude real

NAO EXECUTADO.

Motivo: sem `ANTHROPIC_API_KEY` e com `RUN_ANTHROPIC_INTEGRATION_TESTS`
desabilitado. O runner mantem o limite de duas chamadas por execucao:

```text
1. Em uma frase, explique o que e proteina.
2. Chocolate E2E (leite integral) para conta com alergia milk
```

Ambas validam `HTTP 200`, `source = anthropic`, `answer` nao vazio, `category` e
`safety` validos. A protecao de custo continua: exigir Claude sem a flag falha
antes de qualquer chamada.

## Fallback

EXECUTADO. `AI_NOT_CONFIGURED` continua caindo para resposta local, e a decisao
permanece testada fora do React. O frontend passou a tratar a origem de forma
agnostica: qualquer `source` diferente de `local` aparece como Nutri IA.

## Motor deterministico e privacidade

Ambos PASS, sem alteracao de comportamento em relacao a v0.6.2.

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

## Audits e secret scan

```text
npm audit --audit-level=high                  0 vulnerabilidades
npm --prefix backend audit --audit-level=high 0 vulnerabilidades
secret scan                                   0 segredos reais
```

## O que falta para desbloquear

```text
1. PostgreSQL acessivel + DATABASE_URL em backend/.env
2. ANTHROPIC_API_KEY real em backend/.env
3. RUN_ANTHROPIC_INTEGRATION_TESTS=true apenas na execucao
```

Com isso, `npm run verify:e2e` executa o fluxo completo sem alteracao de codigo.
