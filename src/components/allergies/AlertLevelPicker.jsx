import { useId } from "react";

import { ALLERGY_OPTIONS } from "../../data/allergens";

// Nivel de alerta por alergia (v0.9.0).
//
// Uma caixa por alergia marcada: "alerta maximo" ligado ou desligado. Dois
// niveis, e nao tres - a pergunta que a pessoa sabe responder e "quer o aviso
// mais forte aqui?". O texto descreve o que o APP faz, nunca uma condicao de
// saude da pessoa, e nao diz a ela o que fazer.
//
// So aparece com conta: o nivel e guardado no perfil, no banco.
export function AlertLevelPicker({ selectedAllergies, alertLevels, onSetAlertLevel }) {
  const titleId = useId();
  const selected = ALLERGY_OPTIONS.filter((option) => selectedAllergies.includes(option.id));
  if (!selected.length) return null;

  return (
    <section className="alert-level" aria-labelledby={titleId}>
      <h4 id={titleId}>Alerta máximo</h4>
      <p className="alert-level-copy">
        Marque onde você quer o aviso mais forte. O app passa a avisar também quando o rótulo diz
        "pode conter".
      </p>
      <div className="alert-level-items">
        {selected.map((option) => {
          const strict = alertLevels?.[option.id] === "strict";
          return (
            <label key={option.id} className="check-row alert-level-row">
              <input
                type="checkbox"
                checked={strict}
                onChange={() => onSetAlertLevel(option.id, strict ? "standard" : "strict")}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
