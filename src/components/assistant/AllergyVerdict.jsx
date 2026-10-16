import { AlertTriangle, Info, ShieldCheck } from "lucide-react";

// Veredito deterministico do assistente.
//
// O estado exibido vem SEMPRE de `verdict.status`, que o backend deriva do
// motor de alergenicos. Nada aqui e inferido do texto do modelo: se o backend
// disser que ha conflito, o alerta aparece mesmo que a resposta da IA afirme
// que o produto e seguro.
const PRESENTATION = {
  conflict: { tone: "danger", Icon: AlertTriangle, title: "Conflito com o seu perfil" },
  traces: { tone: "warning", Icon: Info, title: "Pode conter traços" },
  clear: { tone: "safe", Icon: ShieldCheck, title: "Sem conflito com o seu perfil" },
};

// Rotulo de cada item. Conflito de alerta maximo traz `origin` e `alertLevel`
// (v0.9.0); sem eles, e o conflito declarado de sempre.
function riskText(risk) {
  const base = risk.origin === "traces" ? `Pode conter ${risk.label}` : risk.label;
  return risk.alertLevel === "strict" ? `${base} · alerta máximo` : base;
}

export function AllergyVerdict({ verdict }) {
  const presentation = PRESENTATION[verdict?.status];
  // "not_evaluated" (sem produto ou sem alergia no perfil) nao vira alerta:
  // o motor nao avaliou nada, e afirmar qualquer coisa ali seria invencao.
  if (!presentation) return null;

  const { tone, Icon } = presentation;
  // O piso `urgent` so existe para conflito declarado de alergia em alerta
  // maximo. O titulo diz isso; o resto da caixa e o mesmo.
  const title =
    verdict.status === "conflict" && verdict.minimumSafety === "urgent"
      ? "Alerta máximo: conflito com o seu perfil"
      : presentation.title;
  const risks = verdict.status === "traces" ? verdict.traces : verdict.conflicts;

  return (
    <div className={`allergy-verdict ${tone}`} role="status">
      <p className="allergy-verdict-title">
        <Icon size={16} aria-hidden="true" />
        {title}
      </p>
      {risks.length > 0 && (
        <p className="allergy-verdict-tags">
          {risks.map((risk) => (
            <span className="danger-tag" key={risk.id}>
              {riskText(risk)}
            </span>
          ))}
        </p>
      )}
      {verdict.alert && <p className="allergy-verdict-alert">{verdict.alert}</p>}
      <p className="allergy-verdict-origin">
        Verificação do próprio app. O texto abaixo é a explicação do assistente.
      </p>
    </div>
  );
}
