import { Bot, Camera, Search } from "lucide-react";

import { LOCAL_FOODS } from "../../data/foods";

export function HomePage({ selectedAllergies, productAnalysis, onNavigate }) {
  return (
    <>
      <header className="workspace-header">
        <div className="hero-copy">
          <p className="eyebrow dark">Tela principal</p>
          <h2>Consulte alimentos, rótulos e alergênicos em uma tela só.</h2>
          <p>
            Aponte a câmera, leia o código de barras e transforme um rótulo confuso em uma decisão simples sobre ingredientes, nutrientes e restrições.
          </p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => onNavigate("scan")}>
              <Camera size={20} aria-hidden="true" />
              Começar pelo scan
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate("consulta")}>
              <Search size={20} aria-hidden="true" />
              Pesquisar alimento
            </button>
          </div>
        </div>
        <div className="metric-row">
          <div>
            <strong>{LOCAL_FOODS.length}</strong>
            <span>alimentos locais</span>
          </div>
          <div>
            <strong>OFF</strong>
            <span>base global</span>
          </div>
          <div>
            <strong>{selectedAllergies.length}</strong>
            <span>alertas ativos</span>
          </div>
        </div>
      </header>

      <section className="page-grid">
        <article className="page-card accent-search">
          <Search size={24} aria-hidden="true" />
          <h3>Consulta nutricional</h3>
          <p>Pesquise alimentos comuns ou produtos por código de barras.</p>
          <button type="button" onClick={() => onNavigate("consulta")}>
            Abrir consulta
          </button>
        </article>
        <article className="page-card accent-scan">
          <Camera size={24} aria-hidden="true" />
          <h3>Scan de produto</h3>
          <p>Use a câmera ou digite o código de barras manualmente.</p>
          <button type="button" onClick={() => onNavigate("scan")}>
            Abrir scan
          </button>
        </article>
        <article className="page-card accent-chat">
          <Bot size={24} aria-hidden="true" />
          <h3>Assistente</h3>
          <p>Converse com o assistente usando o produto analisado.</p>
          <button type="button" onClick={() => onNavigate("chat")}>
            Abrir chat
          </button>
        </article>
      </section>

      {productAnalysis}
    </>
  );
}
