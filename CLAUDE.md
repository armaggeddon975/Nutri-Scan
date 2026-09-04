# NutriVa

App web de leitura de rotulos e alergias. React/Vite em `src/`, Express/PostgreSQL
em `backend/`, motor deterministico compartilhado em `shared/`.

## Metodo de trabalho

Trabalhe direto na tarefa. **Nao rode o gauntlet-loop**: em 27/08/2026 o dono do
projeto proibiu explicitamente o uso dele. Os arquivos em
`.claude/workflows/gauntlet-loop.js` e `.claude/skills/gauntlet-loop/` continuam
no repositorio, mas nao devem ser invocados nem oferecidos como proximo passo.
So volte a usar se ele pedir de novo, de forma explicita.

A exigencia de prova nao caiu junto. O que substitui o supervisor adversarial sao
os gates automatizados, que sao rapidos e rodam sem subagentes:

```text
npm run build
npm --prefix backend test
node scripts/verify-release.js
npm run e2e:strict            quando houver infraestrutura real
```

Antes de dizer que algo funciona, execute a verificacao e mostre a saida.

## Regras permanentes de entrega

Toda versao entregue precisa de:

```text
versao incrementada em package.json, os dois lockfiles, backend/package.json e health
CHANGELOG, AUDIT_REPORT e E2E_REPORT quando aplicavel
npm run build
npm --prefix backend test          0 falhando
npm audit --audit-level=high       frontend e backend
secret scan
ZIP de auditoria em releases/, validado programaticamente
```

O ZIP nunca inclui `node_modules/`, `dist/`, `.git/`, `.env` real ou segredo, e
usa `/` nos caminhos internos.

## Honestidade de resultado

`NAO EXECUTADO` e um resultado valido e deve ser escrito como tal. Nunca inventar
resultado de teste, credencial, execucao de banco ou chamada de IA. Um gate
bloqueado por ambiente para o trabalho e e reportado — nao vira aprovacao.

## Provedor de IA

Anthropic Claude via Messages API, modelo padrao `claude-sonnet-5` configuravel
por `ANTHROPIC_MODEL`. A chave vive so no backend. O frontend nunca sabe qual
provedor respondeu; os codigos de erro da API publica sao neutros (`AI_*`).
