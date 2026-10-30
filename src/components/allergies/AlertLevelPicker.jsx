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
// `Titulo` (v0.12.0): o nivel do cabecalho depende de onde o seletor esta - h3
// logo abaixo do h2 da tela de Alergias, h5 dentro do cartao da Conta - para a
// hierarquia nunca pular nivel.
export function AlertLevelPicker({ selectedAllergies, alertLevels, onSetAlertLevel, Titulo = "h3" }) {
  const titleId = useId();
  const selected = ALLERGY_OPTIONS.filter((option) => selectedAllergies.includes(option.id));
  if (!selected.length) return null;

  return (
    <section className="alert-level" aria-labelledby={titleId}>
      <Titulo id={titleId} className="alert-level-title">
        Alerta máximo
      </Titulo>
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
              {/* O nome da caixa diz o que ela liga, sem depender do titulo da
                  secao: "Alerta maximo para Leite/lactose, marcado". */}
              <span>
                <span className="sr-only">Alerta máximo para </span>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
