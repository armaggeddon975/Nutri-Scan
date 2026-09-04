// Abas fixas do celular. Cinco destinos no maximo, porque acima disso o alvo
// de toque cai abaixo dos 44px confortaveis numa tela de 360px. Conta fica na
// barra de cima e Guia tem cartao proprio na tela principal.
export function TabBar({ navItems, activePage, allergyCount, onNavigate }) {
  return (
    <nav className="tabbar" aria-label="Navegação rápida">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = activePage === item.id;
        return (
          <button
            type="button"
            key={item.id}
            className={active ? "tab-item active" : "tab-item"}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="tab-icon">
              <Icon size={20} aria-hidden="true" />
              {item.id === "alergias" && allergyCount > 0 && (
                <span className="tab-dot" aria-hidden="true" />
              )}
            </span>
            <span className="tab-label">{item.shortLabel || item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
