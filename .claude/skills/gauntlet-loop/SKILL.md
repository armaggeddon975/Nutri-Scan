---
name: gauntlet-loop
description: Executa uma tarefa com equipe de subagentes e um supervisor adversarial que so libera quando o trabalho impressiona, repetindo em loop ate passar. Use em tarefas substantivas de codigo, auditoria, migracao, refatoracao ou entrega versionada. Nao use em pergunta trivial, leitura de arquivo unico ou conversa.
---

# Gauntlet Loop

Equipe faz. Supervisor tenta reprovar. Repete ate impressionar.

```text
briefing -> equipe (paralela) -> supervisor adversarial
                ^                        |
                +---- bloqueios ---------+
                                         |
                                    aprovado -> relatorio
```

## Quando rodar

Rode quando a tarefa tem entregavel verificavel e qualidade importa mais que
velocidade: implementar feature, migrar camada, auditar, refatorar, fechar
versao, corrigir bug com risco de regressao.

**Nao rode** (responda direto, e diga em uma linha que pulou o gauntlet):

```text
pergunta sobre o codigo ou sobre uma decisao
leitura ou resumo de arquivo
edicao mecanica de uma linha
conversa, duvida de escopo, escolha entre opcoes
qualquer coisa que voce resolveria sozinho em menos de tres passos
```

O portao existe porque equipe + supervisor custa caro. Gastar isso em
"o que esse arquivo faz?" e desperdicio, nao rigor.

Se o usuario disser "roda o gauntlet mesmo assim", rode.

## Como rodar

```text
Workflow({
  scriptPath: '.claude/workflows/gauntlet-loop.js',
  args: { task: '<a tarefa completa, com criterio de pronto>' },
})
```

Use `scriptPath`. A forma `{ name: 'gauntlet-loop' }` so funciona em sessao que
ja comecou com o arquivo no lugar — em sessao onde o workflow acabou de ser
criado ou editado, ela retorna `Workflow "gauntlet-loop" not found`.

Parametros opcionais em `args`:

```text
teamSize   quantas frentes paralelas (padrao 3)
maxRounds  teto de rodadas antes de parar sem aprovar (padrao 4)
minScore   nota minima por dimensao, de 0 a 10 (padrao 8)
```

Escreva `task` como um briefing, nao como um titulo. O briefer decompoe o que
voce escrever; briefing vago produz frentes vagas.

## O padrao do supervisor

O veredito padrao e REPROVADO. Aprovar exige, ao mesmo tempo:

```text
verdict = IMPRESSIONADO
nota >= 8 em correctness, completeness, evidence, craft e safety
zero bloqueios em aberto
pelo menos duas verificacoes independentes citadas
```

Isso e checado **no codigo do workflow**, nao na boa vontade do modelo: um
supervisor que escrever IMPRESSIONADO com nota 6, ou que aprovar sem citar o que
verificou por conta propria, tem a aprovacao rejeitada e o loop continua.

Reprovacao automatica: resultado inventado, teste que nao roda, afirmacao sem
evidencia, trabalho pela metade entregue como pronto.

## Regras da equipe

- Frentes tem **escopo de arquivos disjunto**. Dois workers no mesmo arquivo se
  sobrescrevem; o briefer e obrigado a separar.
- Todo worker entrega `evidence` (comando rodado, saida real, arquivo lido) e
  `notDone` (o que nao fez e por que). Esconder e pior que nao fazer.
- Na rodada seguinte, cada worker recebe os bloqueios da **sua** frente, com a
  evidencia e o conserto esperado. Ninguem corrige as cegas.

## Quando o loop termina sem aprovacao

Atingir `maxRounds` sem aprovar **nao vira entrega**. O relatorio diz o que ficou
pronto, o que nao passou e por que. Leve isso ao usuario com os bloqueios em
aberto — nunca reescreva o veredito para parecer sucesso.

## Ao relatar para o usuario

O relatorio do workflow nao aparece para o usuario; repasse o que importa:

```text
aprovado ou nao, e em quantas rodadas
o que o supervisor reprovou pelo caminho (isso mostra o valor do loop)
notas finais
o que ficou em aberto
whatWouldImpress: o que ainda daria para melhorar
```
