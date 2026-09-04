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

function joinLabels(risks) {
  const labels = risks.map((risk) => risk.label || risk.id);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels[labels.length - 1]}`;
}

// Texto autoral do servidor. Nao passa pelo modelo e nao depende dele.
export function buildAlertText(status, conflicts, traces) {
  if (status === VERDICT_STATUS.conflict) {
    return `Este produto tem ${joinLabels(conflicts)}, que está no seu perfil de alergias. Confira a embalagem física antes de consumir.`;
  }
  if (status === VERDICT_STATUS.traces) {
    return `Este produto pode conter traços de ${joinLabels(traces)}. O rótulo não garante ausência.`;
  }
  return "";
}

// Entrada aceita tanto o allergySnapshot do backend quanto o resultado direto
// de `analyzeProductAllergens` no frontend: os dois carregam `profileRisks`.
export function buildAllergyVerdict({
  profileRisks = [],
  profileAllergies = [],
  hasProductContext = false,
  profileSource = PROFILE_SOURCE.request,
} = {}) {
  const conflicts = profileRisks.filter((risk) => risk?.severity === "contains").map(pickRisk);
  const traces = profileRisks.filter((risk) => risk?.severity === "traces").map(pickRisk);

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
    // Somente conflito declarado impoe piso. Traco e informado sem alterar o
    // nivel de risco do modelo: `traces` significa "pode conter", e elevar o
    // piso ali confundiria o piso com a evidencia declarada.
    minimumSafety: status === VERDICT_STATUS.conflict ? CONFLICT_MINIMUM_SAFETY : null,
  };
}

// Tentativa de minimizacao: ha conflito declarado e o modelo respondeu que
// esta tudo normal. Nao derruba a requisicao; precisa ser visivel.
export function isMinimizationAttempt(modelResponse, verdict) {
  return verdict?.status === VERDICT_STATUS.conflict && modelResponse?.safety === "normal";
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
