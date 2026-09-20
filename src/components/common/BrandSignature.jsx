// Assinatura de quem fez o app. Aparece uma vez por tela: no pe do menu
// lateral no computador, no rodape do conteudo no celular (o CSS esconde a
// copia que sobra em cada caso).
//
// Ate 11/09/2026 este bloco trazia a logo da DG Nutricao ("Um aplicativo de");
// a equipe pediu para trocar pelo credito de quem desenvolveu.
const AUTHORS = ["Dhara Fernandes", "Diego Alvite Moreira", "Giulia Ferreira"];

export function BrandSignature() {
  return (
    <footer className="brand-signature">
      <span className="brand-signature-label">Desenvolvido por</span>
      <ul className="brand-signature-authors">
        {AUTHORS.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </footer>
  );
}
