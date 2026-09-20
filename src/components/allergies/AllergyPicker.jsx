import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";

import { ALLERGY_GROUPS, ALLERGY_OPTIONS } from "../../data/allergens";
import { normalizeText } from "../../utils/text";

// A lista e agrupada: os obrigatorios por lei primeiro ("Mais comuns"), depois
// cada categoria. Um item prioritario aparece SO no primeiro grupo, para nao
// duplicar caixa de marcar na mesma lista.
function groupOptions(options) {
  return ALLERGY_GROUPS.map((group) => ({
    ...group,
    options: options.filter((option) =>
      group.id === "priority" ? option.priority : option.group === group.id && !option.priority,
    ),
  })).filter((group) => group.options.length > 0);
}

// Seletor de alergias.
//
// Substituiu a grade de caixas de marcar, que crescia uma linha a cada alergia
// nova no catalogo e ja nao cabia na tela com 19 itens. Aqui o que fica sempre
// visivel e o que importa para a pessoa - as alergias DELA, como chips - e a
// lista completa abre sob demanda, com busca por nome ou por termo de rotulo
// ("caju" acha Castanhas, "whey" acha Leite/lactose).
//
// A lista abre para baixo, no fluxo da pagina, em vez de flutuar por cima:
// popover dentro de cartao e cortado pelo `overflow` e briga com o teclado do
// celular. Empurrar o conteudo e mais simples e nao esconde nada.
export function AllergyPicker({ selectedAllergies, onToggleAllergy }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const selected = ALLERGY_OPTIONS.filter((option) => selectedAllergies.includes(option.id));

  const query = normalizeText(filter.trim());
  const groups = useMemo(() => {
    const matching = query
      ? ALLERGY_OPTIONS.filter(
          (option) =>
            normalizeText(option.label).includes(query) ||
            option.terms.some((term) => term.includes(query)),
        )
      : ALLERGY_OPTIONS;
    return groupOptions(matching);
  }, [query]);

  // Fecha ao clicar fora ou com Escape. So escuta enquanto esta aberto.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const Chevron = open ? ChevronUp : ChevronDown;

  return (
    <div className="allergy-picker" ref={rootRef}>
      <div className="allergy-picker-selected" aria-live="polite">
        {selected.length ? (
          selected.map((option) => (
            <span className="allergy-chip" key={option.id}>
              {option.label}
              <button
                type="button"
                className="allergy-chip-remove"
                onClick={() => onToggleAllergy(option.id)}
                aria-label={`Remover ${option.label}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </span>
          ))
        ) : (
          <span className="allergy-picker-empty">Nenhuma alergia marcada.</span>
        )}
      </div>

      <div className="allergy-picker-field">
        <Search size={20} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={filter}
          placeholder="Buscar alergia"
          aria-label="Buscar alergia na lista completa"
          aria-expanded={open}
          aria-controls={listId}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setFilter(event.target.value);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className="allergy-picker-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? "Fechar lista de alergias" : "Abrir lista de alergias"}
        >
          <Chevron size={20} aria-hidden="true" />
        </button>
      </div>

      <div
        id={listId}
        className="allergy-picker-list"
        role="group"
        aria-label="Todas as alergias"
        hidden={!open}
      >
        {groups.length ? (
          groups.map((group) => (
            <section className="allergy-picker-group" key={group.id} aria-label={group.label}>
              <h5 className="allergy-picker-group-title">{group.label}</h5>
              <div className="allergy-picker-group-items">
                {group.options.map((option) => (
                  <label key={option.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedAllergies.includes(option.id)}
                      onChange={() => onToggleAllergy(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="empty-copy">Nenhuma alergia com "{filter.trim()}".</p>
        )}
      </div>

      <p className="allergy-picker-count">
        {selected.length} de {ALLERGY_OPTIONS.length} marcadas
      </p>
    </div>
  );
}
