import { ArrowRight, Bot, Camera, ClipboardList, Search, ShieldAlert, ShieldCheck } from "lucide-react";

import { ALLERGY_OPTIONS } from "../../data/allergens";
import { LOCAL_FOODS, SAMPLE_BARCODES, SAMPLE_QUERIES } from "../../data/foods";

// Titulo do cartao de alergias. Ate duas, o nome delas e mais util do que a
// contagem ("Leite/lactose e Castanhas marcados"); a partir de tres o nome nao
// cabe e a contagem volta.
function describeProfile(selectedAllergies) {
  const labels = selectedAllergies
    .map((id) => ALLERGY_OPTIONS.find((option) => option.id === id)?.label)
    .filter(Boolean);

  if (labels.length === 1) return `${labels[0]} marcado.`;
  if (labels.length === 2) return `${labels[0]} e ${labels[1]} marcados.`;
  return `${labels.length} alergias marcadas.`;
}

const SHORTCUTS = [
  {
    id: "consulta",
    icon: Search,
    title: "Buscar alimento",
    copy: "Pelo nome ou pelo código.",
  },
  {
    id: "scan",
    icon: Camera,
    title: "Escanear código",
    copy: "Aponte para o código de barras.",
  },
  {
    id: "chat",
    icon: Bot,
    title: "Perguntar",
    copy: "Tire dúvidas sobre o produto.",
  },
  {
    id: "guia",
    icon: ClipboardList,
    title: "Guia de rótulos",
    copy: "O que olhar em cada alergia.",
  },
];

export function HomePage({ selectedAllergies, productAnalysis, onNavigate, onSearchAndOpen }) {
  const hasProfile = selectedAllergies.length > 0;

  return (
    <>
      {/* Abertura e cartao de alergias lado a lado no computador, empilhados
          no celular. O cartao e o estado mais importante da tela inicial e por
          isso divide a primeira dobra com o titulo, em vez de virar uma faixa
          fina embaixo dele. */}
      <div className="home-opening">
        <section className="hero">
          <p className="eyebrow">Leitura de rótulos</p>
          <h1>Veja o que tem no alimento.</h1>
          <p>Escaneie o código de barras e saiba se pode comer.</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("scan")}>
              <Camera size={20} aria-hidden="true" />
              Escanear um produto
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate("consulta")}>
              <Search size={20} aria-hidden="true" />
              Buscar pelo nome
            </button>
          </div>
        </section>

        <button
          type="button"
          className={hasProfile ? "profile-strip on" : "profile-strip"}
          onClick={() => onNavigate("alergias")}
        >
          <span className="profile-strip-head">
            <span className="eyebrow">Suas alergias</span>
            {hasProfile ? (
              <ShieldCheck size={24} aria-hidden="true" />
            ) : (
              <ShieldAlert size={24} aria-hidden="true" />
            )}
          </span>
          <strong>{hasProfile ? describeProfile(selectedAllergies) : "Nenhuma alergia marcada."}</strong>
          <small>
            {hasProfile
              ? "Todo produto que você abrir é conferido."
              : "Marque as suas e o app avisa em cada produto."}
          </small>
          <span className="profile-strip-action">
            {hasProfile ? "Editar alergias" : "Marcar alergias"}
            <ArrowRight size={18} aria-hidden="true" />
          </span>
        </button>
      </div>

      <section aria-label="Experimente" className="samples">
        <div className="samples-heading">
          <h2>Experimente</h2>
          <p className="samples-note">{LOCAL_FOODS.length} alimentos funcionam sem internet.</p>
        </div>
        <div className="chip-list">
          {SAMPLE_QUERIES.map((sample) => (
            <button type="button" key={sample} onClick={() => onSearchAndOpen(sample)}>
              {sample}
            </button>
          ))}
          {SAMPLE_BARCODES.map((sample) => (
            <button type="button" key={sample.code} onClick={() => onSearchAndOpen(sample.code)}>
              {sample.label}
            </button>
          ))}
        </div>
      </section>

      <section className="shortcut-grid" aria-label="Atalhos">
        {SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <button
              type="button"
              className="shortcut"
              key={shortcut.id}
              onClick={() => onNavigate(shortcut.id)}
            >
              <Icon size={26} aria-hidden="true" />
              <strong>{shortcut.title}</strong>
              <span>{shortcut.copy}</span>
            </button>
          );
        })}
      </section>

      {productAnalysis}
    </>
  );
}
