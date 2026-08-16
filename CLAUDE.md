# NutriScan

App web de leitura de rotulos e alergias. React/Vite em `src/`, Express/PostgreSQL
em `backend/`, motor deterministico compartilhado em `shared/`.

## Metodo padrao de trabalho: gauntlet-loop

Toda tarefa substantiva deste projeto roda pelo **gauntlet-loop**: uma equipe de
subagentes executa em frentes paralelas e um supervisor adversarial so libera
quando o trabalho impressiona. Se reprovar, a equipe refaz.

```text
Workflow({
  scriptPath: '.claude/workflows/gauntlet-loop.js',
  args: { task: '<briefing completo>' },
})
```

O padrao esta em `.claude/skills/gauntlet-loop/SKILL.md` e a orquestracao em
`.claude/workflows/gauntlet-loop.js`.

Vale para: implementar feature, migrar camada, auditar, refatorar, corrigir bug
com risco de regressao, fechar versao.

**Nao vale para** pergunta, leitura de arquivo, edicao de uma linha ou conversa —
nesses casos responda direto e diga em uma linha que pulou o gauntlet. Se o
usuario pedir para rodar mesmo assim, rode.

Aprovacao exige nota minima 8 em correctness, completeness, evidence, craft e
safety, zero bloqueios e verificacao independente citada. Loop sem aprovacao
nao vira entrega.

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
