// Menu lateral do computador. Uma coluna, rotulo sempre visivel, item ativo
// marcado com aria-current. Substituiu a grade de dois botoes por linha, que
// espremia os rotulos e escondia qual tela estava aberta.
export function NavRail({ navItems, activePage, allergyCount, onNavigate }) {
  return (
    <nav className="rail" aria-label="Navegação principal">
      <ul>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={active ? "rail-item active" : "rail-item"}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
                {item.id === "alergias" && allergyCount > 0 && (
                  <span className="rail-badge">{allergyCount}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
