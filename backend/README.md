# NutriVa Backend v0.6.8

API Express responsavel por contas, sessoes e alergias sincronizadas.

## Requisitos

- Node.js 20 ou superior.
- npm 10 ou superior.
- PostgreSQL 14 ou superior.

## Instalar

```bash
npm install
```

Ou pela raiz:

```bash
npm --prefix backend install
```

## Ambiente

Crie `backend/.env` usando `backend/.env.example`:

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

O arquivo `backend/.env` e carregado automaticamente a partir do caminho real do
backend, independentemente de iniciar por `cd backend`, `npm run dev:backend`,
`npm run dev:full` ou `npm run db:migrate`.

Variaveis ja definidas pelo sistema tem prioridade sobre o `.env` local.

`ANTHROPIC_API_KEY` deve receber apenas uma chave real localmente ou na hospedagem.
Nunca coloque uma chave real em arquivos versionados.

## PostgreSQL

Com PostgreSQL local:

```sql
CREATE DATABASE nutriva;
```

Com Docker opcional, pela raiz do projeto:

```bash
npm run db:up
```

URL de desenvolvimento do Docker:

```env
DATABASE_URL=postgresql://nutriva:nutriva_dev_password@localhost:5432/nutriva
```

Esta senha e apenas para desenvolvimento local.

## Migrations

```bash
npm run db:migrate
```

Ou dentro de `backend/`:

```bash
npm run db:migrate
```

As migrations aplicadas ficam em `schema_migrations`.

## Rodar API

```bash
npm run dev
```

Ou pela raiz:

```bash
npm run dev:backend
```

Health:

```bash
curl http://localhost:3000/api/health
```

Respostas possiveis:

```json
{ "status": "ok", "database": "not_configured", "ai": "not_configured", "aiProvider": "anthropic", "version": "0.6.8" }
```

```json
{ "status": "ok", "database": "connected", "ai": "configured", "aiProvider": "anthropic", "version": "0.6.8" }
```

```json
{ "status": "degraded", "database": "error", "ai": "not_configured", "aiProvider": "anthropic", "version": "0.6.8" }
```

## Testes

```bash
npm test
npm audit --audit-level=high
```

Testes reais da Anthropic ficam desligados por padrao. Para executar uma chamada
curta e paga de integracao, defina:

```env
RUN_ANTHROPIC_INTEGRATION_TESTS=true
ANTHROPIC_API_KEY=sua-chave-no-ambiente
```

Nao coloque a chave no codigo.
