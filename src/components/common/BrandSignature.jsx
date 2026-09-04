import logoDG from "../../assets/dg-nutricao.jpg";

// Assinatura de quem esta por tras do produto. O NutriVa e o aplicativo; a DG
// Nutricao e quem assina. Por isso a logo completa vive aqui, no rodape, e nao
// na barra de cima: la em cima o app precisa dizer o proprio nome.
//
// A moldura existe porque o arquivo original e um quadrado com muita margem
// branca em volta. Recortar por CSS (e nao gerar um segundo arquivo cortado)
// mantem um unico asset no repositorio e preserva o <img alt>, que uma imagem
// de fundo nao teria - "DG Nutricao" e a informacao util para leitor de tela.
export function BrandSignature() {
  return (
    <footer className="brand-signature">
      <span className="brand-signature-label">Um aplicativo de</span>
      <span className="brand-signature-frame">
        <img src={logoDG} alt="DG Nutrição" />
      </span>
    </footer>
  );
}
