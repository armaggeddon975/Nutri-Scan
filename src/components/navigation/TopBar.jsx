import { Search, User } from "lucide-react";

// Barra superior fixa. Ela carrega a busca global, que antes so existia dentro
// da pagina Consulta: agora da para procurar um alimento de qualquer tela.
export function TopBar({ query, currentUser, onQueryChange, onSubmitSearch, onNavigate }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          type="button"
          className="brand"
          onClick={() => onNavigate("home")}
          aria-label="NutriVa, ir para a tela principal"
        >
          {/* O simbolo e a logo da DG, nao um icone de biblioteca. Fica
              decorativo porque o botao ja se anuncia pelo aria-label acima. */}
          <img className="brand-mark" src="/dg-simbolo.png" alt="" aria-hidden="true" />
          <span className="brand-name">NutriVa</span>
        </button>

        <form className="topbar-search" onSubmit={onSubmitSearch} role="search">
          <label className="sr-only" htmlFor="busca-global">
            Buscar alimento ou codigo de barras
          </label>
          <Search size={20} aria-hidden="true" />
          {/* O texto de dica e curto de proposito: com a fonte no tamanho que o
              publico enxerga, a frase inteira nao cabe na caixa e some no meio
              de reticencias. A descricao completa continua no rotulo acima, que
              e o que o leitor de tela anuncia. */}
          <input
            id="busca-global"
            name="q"
            value={query}
            placeholder="Buscar alimento"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </form>

        <button type="button" className="topbar-account" onClick={() => onNavigate("conta")}>
          <User size={20} aria-hidden="true" />
          <span>{currentUser ? currentUser.name : "Entrar"}</span>
        </button>
      </div>
    </header>
  );
}
