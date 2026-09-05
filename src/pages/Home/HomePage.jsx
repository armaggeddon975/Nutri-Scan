import { Bot, Camera, ClipboardList, Search, ShieldAlert, ShieldCheck } from "lucide-react";

import { LOCAL_FOODS, SAMPLE_BARCODES, SAMPLE_QUERIES } from "../../data/foods";

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
      <section className="hero">
        <h1>Veja o que tem no alimento.</h1>
        <p>Escaneie o código de barras e saiba se pode comer.</p>
        <div className="hero-actions">
          <button className="primary-button" type="button" onClick={() => onNavigate("scan")}>
            <Camera size={18} aria-hidden="true" />
            Escanear um produto
          </button>
          <button className="secondary-button" type="button" onClick={() => onNavigate("consulta")}>
            <Search size={18} aria-hidden="true" />
            Buscar pelo nome
          </button>
        </div>
      </section>

      <button
        type="button"
        className={hasProfile ? "profile-strip on" : "profile-strip"}
        onClick={() => onNavigate("alergias")}
      >
        {hasProfile ? (
          <ShieldCheck size={20} aria-hidden="true" />
        ) : (
          <ShieldAlert size={20} aria-hidden="true" />
        )}
        <span>
          <strong>
            {hasProfile
              ? `${selectedAllergies.length} ${selectedAllergies.length === 1 ? "alergia marcada" : "alergias marcadas"}`
              : "Nenhuma alergia marcada"}
          </strong>
          <small>
            {hasProfile
              ? "Todo produto é conferido."
              : "Marque as suas e o app avisa."}
          </small>
        </span>
        <span className="profile-strip-action">
          {hasProfile ? "Editar" : "Configurar"}
        </span>
      </button>

      <section aria-label="Experimente" className="samples">
        <h2>Experimente</h2>
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
        <p className="samples-note">
          {LOCAL_FOODS.length} alimentos funcionam sem internet.
        </p>
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
              <Icon size={20} aria-hidden="true" />
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
