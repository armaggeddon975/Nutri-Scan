import { BrandSignature } from "../common/BrandSignature";

// Menu lateral do computador. Uma coluna, rotulo sempre visivel, item ativo
// marcado com aria-current. Substituiu a grade de dois botoes por linha, que
// espremia os rotulos e escondia qual tela estava aberta.
//
// A marca abre a coluna e a assinatura de quem fez fecha, como a lombada de
// uma revista. No celular este menu nao existe, e os dois voltam para a barra
// de cima e para o rodape do conteudo.
export function NavRail({ navItems, activePage, allergyCount, onNavigate }) {
  return (
    <nav className="rail" aria-label="Navegação principal">
      <button
        type="button"
        className="rail-brand"
        onClick={() => onNavigate("home")}
        aria-label="NutriScan, ir para a tela principal"
      >
        <img className="brand-logo" src="/nutriscan-logo.png" alt="" aria-hidden="true" />
      </button>
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
      <BrandSignature />
    </nav>
  );
}
