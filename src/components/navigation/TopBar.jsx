import { Leaf, Search, User } from "lucide-react";

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
          <span className="brand-mark" aria-hidden="true">
            <Leaf size={18} />
          </span>
          <span className="brand-name">NutriVa</span>
        </button>

        <form className="topbar-search" onSubmit={onSubmitSearch} role="search">
          <label className="sr-only" htmlFor="busca-global">
            Buscar alimento ou codigo de barras
          </label>
          <Search size={17} aria-hidden="true" />
          <input
            id="busca-global"
            name="q"
            value={query}
            placeholder="Buscar alimento ou código de barras"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </form>

        <button type="button" className="topbar-account" onClick={() => onNavigate("conta")}>
          <User size={17} aria-hidden="true" />
          <span>{currentUser ? currentUser.name : "Entrar"}</span>
        </button>
      </div>
    </header>
  );
}
