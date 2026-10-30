// Cabecalho de cada tela.
//
// ESTRUTURA (v0.12.0). Cada tela tem um `h1` - invisivel, para leitor de tela,
// com o nome do app e da tela - e o titulo visivel em `h2`, como o design ja
// desenha. Assim a hierarquia comeca em `h1` e desce sem pular nivel. A Home tem
// o proprio `h1` e nao usa este componente.
//
// FOCO. Quando a tela troca, o app leva o foco para este titulo
// (`data-titulo-da-tela`, `tabIndex={-1}`): a pessoa que navega por teclado ou
// leitor de tela comeca a nova tela pelo comeco, e nao fica com o foco num
// botao que sumiu.
export function PageHeader({ eyebrow, title, subtitle }) {
  return (
    <header className="page-header">
      <h1 className="sr-only">{`NutriScan: ${eyebrow}`}</h1>
      <p className="eyebrow dark">{eyebrow}</p>
      <h2 tabIndex={-1} data-titulo-da-tela="">
        {title}
      </h2>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </header>
  );
}
