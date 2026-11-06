import { Menu } from "lucide-react";

// Botao no canto de cima, a esquerda, com tres barrinhas: abre e fecha o menu
// lateral do computador. O nome do botao e fixo ("Menu"); se o menu esta
// aberto ou fechado, quem diz e o `aria-expanded`, que o leitor de tela
// anuncia. O `title` repete a acao para quem usa o mouse. No celular o botao
// nao aparece: la a navegacao e a barra de abas.
export function MenuToggle({ aberto, onAlternar }) {
  return (
    <button
      type="button"
      className="menu-toggle"
      aria-label="Menu"
      aria-controls="menu-lateral"
      aria-expanded={aberto}
      title={aberto ? "Fechar o menu" : "Abrir o menu"}
      onClick={onAlternar}
    >
      <Menu size={22} aria-hidden="true" />
    </button>
  );
}
