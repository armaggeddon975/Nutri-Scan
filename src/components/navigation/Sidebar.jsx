import { Leaf, User, Utensils } from "lucide-react";

import { SAMPLE_BARCODES, SAMPLE_QUERIES } from "../../data/foods";
import { StatusLine } from "../common/StatusLine";

export function Sidebar({
  navItems,
  activePage,
  currentUser,
  selectedAllergies,
  status,
  onNavigate,
  onSearchAndOpen,
}) {
  return (
    <aside className="sidebar" aria-label="Dashboard">
      <div className="brand-block">
        <div className="brand-mark">
          <Leaf size={24} aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">Projeto do Ano</p>
          <h1>NutriScan</h1>
        </div>
      </div>

      <nav className="dashboard-menu" aria-label="Navegação do dashboard">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={activePage === item.id ? "active" : ""}
              aria-current={activePage === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="dashboard-summary" aria-label="Resumo do aplicativo">
        <p className="eyebrow">O que a gente faz</p>
        <strong>Leitura nutricional rápida para decidir melhor.</strong>
        <span>
          Pesquise alimentos, escaneie rótulos, veja ingredientes, cruze com alergias e converse com o assistente.
        </span>
      </section>

      <section className="account-mini" aria-label="Conta atual">
        <User size={18} aria-hidden="true" />
        <div>
          <strong>{currentUser ? currentUser.name : "Visitante"}</strong>
          <span>
            {currentUser
              ? `${selectedAllergies.length} alergia(s) salva(s)`
              : "Entre para salvar suas alergias"}
          </span>
        </div>
        <button type="button" onClick={() => onNavigate("conta")}>
          {currentUser ? "Perfil" : "Entrar"}
        </button>
      </section>

      <StatusLine status={status} />

      <section className="quick-panel" aria-label="Exemplos rápidos">
        <div className="panel-heading">
          <Utensils size={18} aria-hidden="true" />
          <h2>Exemplos rápidos</h2>
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
    </aside>
  );
}
