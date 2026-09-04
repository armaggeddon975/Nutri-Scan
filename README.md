# NutriVa v0.6.8

NutriVa e um app web para consultar alimentos por nome ou codigo de barras,
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
DATABASE_URL=postgresql://usuario:senha@localhost:5432/nutriva
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

## Seguranca

- Sessao em cookie HttpOnly.
- Token de sessao salvo no banco apenas como hash SHA-256.
- Senhas com `crypto.scrypt`, salt unico e comparacao segura.
- Nenhuma chave secreta no frontend.
- Chave Anthropic somente no backend.
- Chamadas Claude usam a Messages API com Structured Outputs.
- Sessoes guardam apenas `token_hash`; o E2E inspeciona `information_schema`
  para confirmar que nao existe coluna de token bruto.
- A IA explica o snapshot deterministico; ela nao decide alergia sozinha.
- O assistente e informativo e nao substitui medico ou nutricionista.

## Limite semantico milk/lactose

O ID legado `milk` representa hoje `Leite/lactose` para manter compatibilidade
com dados salvos. Por isso, `sem lactose` nao e interpretado automaticamente
como `sem proteinas do leite`. Se o rotulo tambem trouxer `leite`, `whey`,
`caseina` ou `proteina do leite`, o motor marca `milk` como `contains`.

## Documentacao

- [API](docs/API.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Nutri Assistente IA](docs/AI_ASSISTANT.md)
- [Relatorio de auditoria](AUDIT_REPORT.md)
- [Relatorio E2E](E2E_REPORT.md)
