export const meta = {
  name: 'gauntlet-loop',
  description: 'Equipe de subagentes executa a tarefa e um supervisor adversarial so libera quando o trabalho impressiona; repete ate passar.',
  whenToUse: 'Tarefa substantiva de codigo, auditoria, migracao ou entrega onde qualidade importa mais que velocidade. Nao usar em pergunta trivial ou conversa.',
  phases: [
    { title: 'Briefing', detail: 'decompor a tarefa em frentes com escopo de arquivos disjunto' },
    { title: 'Equipe', detail: 'workers executam as frentes em paralelo, cada um com evidencia' },
    { title: 'Supervisao', detail: 'supervisor tenta reprovar o trabalho e verifica por conta propria' },
    { title: 'Veredito', detail: 'sintese final apenas do trabalho aprovado' },
  ],
}

// ---------------------------------------------------------------------------
// Parametros
// ---------------------------------------------------------------------------

const input = typeof args === 'string' ? { task: args } : args || {}
const TASK = input.task
const MAX_ROUNDS = input.maxRounds || 4
const TEAM_SIZE = input.teamSize || 3
const MIN_SCORE = input.minScore || 8 // de 0 a 10, em toda dimensao

if (!TASK) throw new Error('gauntlet-loop precisa de args.task com a tarefa a executar')

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    fronts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          mission: { type: 'string' },
          fileScope: { type: 'array', items: { type: 'string' } },
          deliverable: { type: 'string' },
          proof: { type: 'string' },
        },
        required: ['name', 'mission', 'fileScope', 'deliverable', 'proof'],
      },
    },
    sharedContext: { type: 'string' },
  },
  required: ['fronts', 'sharedContext'],
}

const WORK_SCHEMA = {
  type: 'object',
  properties: {
    front: { type: 'string' },
    summary: { type: 'string' },
    changes: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'string' } },
    notDone: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['front', 'summary', 'changes', 'evidence', 'notDone', 'risks'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['IMPRESSIONADO', 'REPROVADO'] },
    scores: {
      type: 'object',
      properties: {
        correctness: { type: 'number' },
        completeness: { type: 'number' },
        evidence: { type: 'number' },
        craft: { type: 'number' },
        safety: { type: 'number' },
      },
      required: ['correctness', 'completeness', 'evidence', 'craft', 'safety'],
    },
    verifiedIndependently: { type: 'array', items: { type: 'string' } },
    blockers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['front', 'problem', 'evidence', 'fix'],
      },
    },
    whatWouldImpress: { type: 'string' },
    summary: { type: 'string' },
  },
  required: ['verdict', 'scores', 'verifiedIndependently', 'blockers', 'whatWouldImpress', 'summary'],
}

// ---------------------------------------------------------------------------
// Regras que o codigo impoe (nao dependem do humor do supervisor)
// ---------------------------------------------------------------------------

function approvalDecision(verdict) {
  if (!verdict) return { approved: false, reason: 'supervisor nao retornou veredito' }

  const scores = verdict.scores || {}
  const dimensions = ['correctness', 'completeness', 'evidence', 'craft', 'safety']
  const low = dimensions.filter((key) => !(scores[key] >= MIN_SCORE))

  if (verdict.verdict !== 'IMPRESSIONADO') {
    return { approved: false, reason: 'supervisor reprovou' }
  }
  if (verdict.blockers && verdict.blockers.length) {
    return { approved: false, reason: `aprovou com ${verdict.blockers.length} bloqueio(s) em aberto` }
  }
  if (low.length) {
    return { approved: false, reason: `nota abaixo de ${MIN_SCORE} em: ${low.join(', ')}` }
  }
  if (!verdict.verifiedIndependently || verdict.verifiedIndependently.length < 2) {
    return { approved: false, reason: 'aprovou sem citar verificacao independente suficiente' }
  }
  return { approved: true, reason: 'aprovado com evidencia' }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SUPERVISOR_CHARTER = `
Voce e o SUPERVISOR do gauntlet-loop. Seu padrao e alto e sua postura e adversarial.

Seu veredito padrao e REPROVADO. Voce so escreve IMPRESSIONADO quando o trabalho
seria elogiado por um engenheiro senior exigente que odeia retrabalho.

REGRAS INEGOCIAVEIS
- Nunca acredite no relato do worker. Verifique voce mesmo: leia os arquivos que
  ele diz ter mudado, rode os comandos que ele diz ter rodado, confira a saida.
- Liste em verifiedIndependently o que VOCE verificou, com caminho de arquivo ou
  comando. Relato de terceiro nao conta como verificacao.
- Resultado inventado, teste que nao roda, "deve funcionar" e afirmacao sem
  evidencia sao REPROVADO imediato, com nota 0 em evidence.
- Trabalho pela metade entregue como pronto e REPROVADO.
- Se algo ficou de fora por decisao consciente e esta declarado, isso nao e
  falha; falha e omitir.

NOTAS (0 a 10), sem generosidade:
- correctness: faz o que promete, inclusive nos casos de borda
- completeness: cobre a tarefa inteira, nada silenciosamente encolhido
- evidence: cada afirmacao tem prova verificavel
- craft: le como o codigo ao redor, sem gambiarra nem complexidade inutil
- safety: nao quebra o que ja funcionava, nao vaza segredo, nao apaga dado

7 e "aceitavel". Voce nao aprova aceitavel. Aprove a partir de 8 em TODAS.

Em whatWouldImpress, escreva o que faltou para o trabalho ser excelente, mesmo
quando aprovar. Em blockers, cada item precisa de evidencia concreta e do
conserto esperado.
`

function workerPrompt(front, round, blockers, sharedContext) {
  const fixes = blockers.length
    ? `\nO SUPERVISOR REPROVOU A RODADA ANTERIOR. Conserte exatamente isto na sua frente:\n${blockers
        .map((item, index) => `${index + 1}. ${item.problem}\n   evidencia: ${item.evidence}\n   conserto esperado: ${item.fix}`)
        .join('\n')}\n`
    : ''

  return `Voce e um worker do gauntlet-loop, rodada ${round}.

TAREFA GERAL
${TASK}

CONTEXTO COMPARTILHADO
${sharedContext}

SUA FRENTE: ${front.name}
Missao: ${front.mission}
Escopo de arquivos: ${front.fileScope.join(', ')}
Entregavel: ${front.deliverable}
Prova exigida: ${front.proof}
${fixes}
REGRAS
- Trabalhe apenas dentro do seu escopo de arquivos. Outro worker cuida do resto.
- Um supervisor adversarial vai conferir cada afirmacao sua. Nao afirme nada que
  voce nao tenha executado ou lido.
- Rode o que der para rodar (testes, build, comando) e guarde a saida real.
- Se algo nao deu para fazer, coloque em notDone com o motivo. Nao esconda.
- Nao invente resultado, credencial ou teste.

Retorne o relatorio estruturado da sua frente.`
}

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------

phase('Briefing')
log(`gauntlet-loop: ate ${MAX_ROUNDS} rodadas, nota minima ${MIN_SCORE}/10 em todas as dimensoes`)

const plan = await agent(
  `Voce e o BRIEFER do gauntlet-loop.

TAREFA
${TASK}

Explore o repositorio o suficiente para decompor a tarefa em ${TEAM_SIZE} frentes
paralelas de trabalho real.

REGRAS
- As frentes precisam ter ESCOPO DE ARQUIVOS DISJUNTO. Dois workers nao podem
  editar o mesmo arquivo; isso corromperia o trabalho um do outro.
- Cada frente precisa de um entregavel concreto e de uma prova verificavel
  (comando que roda, teste que passa, arquivo que existe com tal conteudo).
- Frente que nao produz entregavel verificavel nao deve existir.
- Em sharedContext, escreva o que todo worker precisa saber: convencoes do
  projeto, comandos de teste/build, restricoes que nao podem ser violadas.`,
  { label: 'briefer', phase: 'Briefing', schema: PLAN_SCHEMA },
)

const fronts = plan.fronts.slice(0, TEAM_SIZE)
log(`frentes: ${fronts.map((front) => front.name).join(' | ')}`)

let round = 0
let approved = false
let verdict = null
let reports = []
let blockers = []
const history = []

while (round < MAX_ROUNDS && !approved) {
  round += 1

  phase('Equipe')
  log(`rodada ${round}: ${fronts.length} workers em paralelo${blockers.length ? ` corrigindo ${blockers.length} bloqueio(s)` : ''}`)

  reports = (
    await parallel(
      fronts.map((front) => () => {
        const frontBlockers = blockers.filter(
          (item) => item.front === front.name || item.front === 'todas' || item.front === 'geral',
        )
        return agent(workerPrompt(front, round, frontBlockers, plan.sharedContext), {
          label: `worker:${front.name}`,
          phase: 'Equipe',
          schema: WORK_SCHEMA,
        })
      }),
    )
  ).filter(Boolean)

  if (!reports.length) throw new Error(`rodada ${round}: nenhum worker entregou resultado`)

  phase('Supervisao')

  verdict = await agent(
    `${SUPERVISOR_CHARTER}

TAREFA QUE FOI PEDIDA
${TASK}

RODADA ${round} de ${MAX_ROUNDS}.

RELATORIOS DA EQUIPE (trate como alegacao, nao como fato)
${JSON.stringify(reports, null, 2)}
${
  history.length
    ? `\nVOCE JA REPROVOU ANTES. Bloqueios da rodada passada:\n${JSON.stringify(history[history.length - 1].blockers, null, 2)}\nConfirme se cada um foi realmente resolvido; um bloqueio "resolvido" no papel e reprovacao dupla.`
    : ''
}

Agora verifique por conta propria e emita o veredito.`,
    { label: `supervisor:r${round}`, phase: 'Supervisao', schema: VERDICT_SCHEMA, effort: 'high' },
  )

  const decision = approvalDecision(verdict)
  approved = decision.approved
  blockers = verdict?.blockers || []
  history.push({ round, verdict: verdict?.verdict, scores: verdict?.scores, blockers, reason: decision.reason })

  const scoreLine = verdict?.scores
    ? Object.entries(verdict.scores)
        .map(([key, value]) => `${key} ${value}`)
        .join(' / ')
    : 'sem notas'

  log(`rodada ${round}: ${approved ? 'APROVADO' : 'REPROVADO'} (${decision.reason}) - ${scoreLine}`)

  if (!approved && round === MAX_ROUNDS) {
    log(`limite de ${MAX_ROUNDS} rodadas atingido sem aprovacao; nada sera declarado pronto`)
  }
}

phase('Veredito')

const synthesis = await agent(
  `Voce e o RELATOR do gauntlet-loop. Escreva o relatorio final em portugues.

TAREFA
${TASK}

RESULTADO: ${approved ? 'APROVADO pelo supervisor' : `NAO APROVADO em ${round} rodada(s)`}

HISTORICO DE SUPERVISAO
${JSON.stringify(history, null, 2)}

TRABALHO DA ULTIMA RODADA
${JSON.stringify(reports, null, 2)}

Escreva:
1. O que foi entregue de fato, por frente.
2. A prova de cada entrega (arquivo, comando, saida).
3. O que continua em aberto, se houver.
${approved ? '4. O que o supervisor apontou como ponto alto e o que ainda daria para melhorar.' : '4. Exatamente por que o supervisor reprovou e o que falta para passar.'}

Nao declare pronto nada que o supervisor nao aprovou. Nao invente resultado.`,
  { label: 'relator', phase: 'Veredito' },
)

return {
  approved,
  rounds: round,
  finalScores: verdict?.scores || null,
  openBlockers: approved ? [] : blockers,
  whatWouldImpress: verdict?.whatWouldImpress || '',
  history,
  report: synthesis,
}
