// Veredito deterministico de alergia.
//
// Este modulo e a autoridade sobre conflito de alergenico. Ele deriva o
// veredito exclusivamente do resultado do motor em `allergenEngine.js`, e o
// backend o escreve na resposta depois que o modelo ja respondeu. Nenhum campo
// aqui pode ser lido, escrito ou influenciado pela resposta da IA.
//
// Antes da v0.6.8 essa autoridade existia apenas como frase no system prompt.
// Instrucao ao modelo nao e garantia: um modelo que respondesse "nao contem
// leite" para um perfil com alergia a leite era entregue ao usuario como veio.

export const SAFETY_ORDER = ["normal", "caution", "urgent"];

export const VERDICT_STATUS = {
  conflict: "conflict",
  traces: "traces",
  clear: "clear",
  notEvaluated: "not_evaluated",
};

export const PROFILE_SOURCE = {
  database: "postgresql",
  request: "request",
};

// Piso de risco. Conflito declarado nunca sai como "normal".
export const CONFLICT_MINIMUM_SAFETY = "caution";

// NIVEL DE ALERTA POR ALERGIA (v0.9.0)
//
// A pessoa declara, por alergia, quanto rigor quer do app. Sao DOIS niveis:
//
//   standard   o comportamento de sempre, identico ao da v0.8.0
//   strict     "alerta maximo": o app tambem avisa de traco, e o conflito
//              declarado sobe o piso para `urgent`
//
// O nivel e DECLARADO pela pessoa e vem do perfil dela no banco. Nada aqui
// infere, sugere ou corrige nivel nenhum, e a resposta do modelo nao chega
// perto dele: o veredito e montado antes da chamada de IA, e o nivel nem e
// enviado ao modelo.
//
// O nome do campo e `alertLevel`, e nao "severidade", de proposito. Neste
// motor `risk.severity` JA e a classificacao do rotulo (`contains`/`traces`);
// reusar a palavra para a declaracao da pessoa faria `severity` significar
// duas coisas no mesmo objeto. E "alerta maximo" descreve o que a pessoa quer
// do app, nao uma condicao clinica dela.
export const ALERT_LEVELS = { standard: "standard", strict: "strict" };
export const ALERT_LEVEL_VALUES = [ALERT_LEVELS.standard, ALERT_LEVELS.strict];
export const DEFAULT_ALERT_LEVEL = ALERT_LEVELS.standard;

// Piso do alerta maximo. Vale SO para conflito declarado de alergia `strict`:
// alerta que aparece sempre deixa de ser alerta, entao `urgent` nao e o piso de
// mais nada.
export const STRICT_CONFLICT_MINIMUM_SAFETY = "urgent";

// De onde veio cada conflito. Conflito de alergia `standard` so pode vir do que
// e declarado; o de traco so existe para alergia `strict`.
export const VERDICT_ORIGIN = { declared: "declared", traces: "traces" };

export function isStrictAlert(alertLevels, allergyId) {
  if (!alertLevels || typeof alertLevels !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(alertLevels, allergyId)) return false;
  return alertLevels[allergyId] === ALERT_LEVELS.strict;
}

export function safetyRank(level) {
  const index = SAFETY_ORDER.indexOf(level);
  // Nivel desconhecido e tratado como o mais baixo: assim o piso sempre eleva.
  return index === -1 ? 0 : index;
}

export function raiseSafety(level, minimum) {
  if (!minimum) return level;
  return safetyRank(level) < safetyRank(minimum) ? minimum : level;
}

function pickRisk(risk) {
  return { id: risk.id, label: risk.label };
}

// Entrada de conflito de alergia em alerta maximo. Os dois campos a mais so
// aparecem aqui: o conflito de alergia `standard` continua `{ id, label }`,
// byte a byte o da v0.8.0. Quem consome le `origin` e `alertLevel`; ausentes,
// valem `declared` e `standard`.
function pickStrictRisk(risk, origin) {
  return { id: risk.id, label: risk.label, origin, alertLevel: ALERT_LEVELS.strict };
}

export function conflictOrigin(conflict) {
  return conflict?.origin === VERDICT_ORIGIN.traces ? VERDICT_ORIGIN.traces : VERDICT_ORIGIN.declared;
}

function isStrictConflict(conflict) {
  return conflict?.alertLevel === ALERT_LEVELS.strict;
}

function joinLabels(risks) {
  const labels = risks.map((risk) => risk.label || risk.id);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

// Texto do alerta maximo. Diz o que o rotulo traz e o que o perfil declara -
// nada sobre o que a pessoa deve fazer alem de conferir a embalagem, que e o
// mesmo fecho do texto de sempre.
function buildStrictAlertText(conflicts) {
  const declared = conflicts.filter((conflict) => conflictOrigin(conflict) === VERDICT_ORIGIN.declared);
  const fromTraces = conflicts.filter((conflict) => conflictOrigin(conflict) === VERDICT_ORIGIN.traces);
  const strict = conflicts.filter(isStrictConflict);

  const parts = [];
  if (declared.length) parts.push(`Este produto tem ${joinLabels(declared)}, que está no seu perfil de alergias.`);
  if (fromTraces.length) parts.push(`Pode conter traços de ${joinLabels(fromTraces)}.`);
  parts.push(`Você pediu alerta máximo para ${joinLabels(strict)}.`);
  parts.push("Confira a embalagem física antes de consumir.");
  return parts.join(" ");
}

// Texto autoral do servidor. Nao passa pelo modelo e nao depende dele.
export function buildAlertText(status, conflicts, traces) {
  if (status === VERDICT_STATUS.conflict && conflicts.some(isStrictConflict)) {
    return buildStrictAlertText(conflicts);
  }
  if (status === VERDICT_STATUS.conflict) {
    return `Este produto tem ${joinLabels(conflicts)}, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.`;
  }
  if (status === VERDICT_STATUS.traces) {
    return `Este produto pode conter traços de ${joinLabels(traces)}. O rótulo não garante ausência.`;
  }
  return "";
}

// O piso sai do proprio veredito, e so de dois lugares: conflito declarado de
// alergia `strict` pede `urgent`; qualquer outro conflito pede `caution`.
function minimumSafetyFor(status, conflicts) {
  if (status !== VERDICT_STATUS.conflict) return null;
  const strictDeclared = conflicts.some(
    (conflict) => isStrictConflict(conflict) && conflictOrigin(conflict) === VERDICT_ORIGIN.declared,
  );
  return strictDeclared ? STRICT_CONFLICT_MINIMUM_SAFETY : CONFLICT_MINIMUM_SAFETY;
}

// Entrada aceita tanto o allergySnapshot do backend quanto o resultado direto
// de `analyzeProductAllergens` no frontend: os dois carregam `profileRisks`.
//
// `alertLevels` e o mapa `{ allergyId: "standard" | "strict" }` do perfil.
// Ausente, ou sem a alergia, vale `standard`.
//
// O QUE MUDA E A RESPOSTA A CLASSIFICACAO, NAO A CLASSIFICACAO
//
// Quem decide o que e declarado e o que e traco continua sendo
// `analyzeProductAllergens`, com as mesmas regras. Aqui so muda o que se faz
// com isso quando a alergia e `strict`:
//
//   declarado + standard   conflito, piso caution          (igual a v0.8.0)
//   declarado + strict     conflito, piso urgent
//   traco     + standard   `traces`, sem piso               (igual a v0.8.0)
//   traco     + strict     conflito, piso caution
export function buildAllergyVerdict({
  profileRisks = [],
  profileAllergies = [],
  hasProductContext = false,
  profileSource = PROFILE_SOURCE.request,
  alertLevels = {},
} = {}) {
  const declaredRisks = profileRisks.filter((risk) => risk?.severity === "contains");
  const traceRisks = profileRisks.filter((risk) => risk?.severity === "traces");

  const conflicts = [
    ...declaredRisks.map((risk) =>
      isStrictAlert(alertLevels, risk.id) ? pickStrictRisk(risk, VERDICT_ORIGIN.declared) : pickRisk(risk),
    ),
    ...traceRisks
      .filter((risk) => isStrictAlert(alertLevels, risk.id))
      .map((risk) => pickStrictRisk(risk, VERDICT_ORIGIN.traces)),
  ];
  const traces = traceRisks.filter((risk) => !isStrictAlert(alertLevels, risk.id)).map(pickRisk);

  let status;
  let reason = null;

  if (!hasProductContext) {
    status = VERDICT_STATUS.notEvaluated;
    reason = "no_product";
  } else if (profileAllergies.length === 0) {
    status = VERDICT_STATUS.notEvaluated;
    reason = "no_profile_allergies";
  } else if (conflicts.length > 0) {
    status = VERDICT_STATUS.conflict;
  } else if (traces.length > 0) {
    status = VERDICT_STATUS.traces;
  } else {
    status = VERDICT_STATUS.clear;
  }

  return {
    status,
    reason,
    source: "deterministic_engine",
    conflicts,
    traces,
    profileSource,
    alert: buildAlertText(status, conflicts, traces),
    // Somente conflito impoe piso. Traco de alergia `standard` continua
    // informado sem alterar o nivel de risco do modelo: `traces` significa
    // "pode conter", e elevar o piso ali confundiria o piso com a evidencia
    // declarada. Traco de alergia `strict` vira conflito, e por isso tem piso.
    minimumSafety: minimumSafetyFor(status, conflicts),
  };
}

// Os conflitos que vieram do que o rotulo DECLARA, de qualquer nivel.
export function declaredConflicts(verdict) {
  return (verdict?.conflicts || []).filter(
    (conflict) => conflictOrigin(conflict) === VERDICT_ORIGIN.declared,
  );
}

// Tentativa de minimizacao: ha conflito declarado e o modelo respondeu que
// esta tudo normal. Nao derruba a requisicao; precisa ser visivel.
//
// A regra olha SO o conflito declarado, de qualquer nivel - a mesma pergunta da
// v0.8.0. Ela nao depende do nivel de alerta de proposito: o registro vai para
// o log, e um registro que existisse so para alergia `strict` (o traco que
// virou conflito, ou o "caution" abaixo do piso `urgent`) contaria ao log qual
// alergia a pessoa marcou como alerta maximo.
export function isMinimizationAttempt(modelResponse, verdict) {
  return (
    verdict?.status === VERDICT_STATUS.conflict &&
    declaredConflicts(verdict).length > 0 &&
    modelResponse?.safety === "normal"
  );
}

// Ponto unico por onde toda resposta do endpoint passa antes de ir ao usuario.
//
// 1. descarta qualquer `allergyVerdict` vindo da resposta do modelo;
// 2. aplica o piso de risco;
// 3. anexa o veredito autoral do servidor.
export function applyAllergyAuthority(modelResponse, verdict) {
  const { allergyVerdict: _fromModel, ...rest } = modelResponse || {};
  const safety = raiseSafety(rest.safety, verdict?.minimumSafety);

  return {
    ...rest,
    safety,
    allergyVerdict: {
      ...verdict,
      safetyFloorApplied: safety !== rest.safety,
    },
  };
}
