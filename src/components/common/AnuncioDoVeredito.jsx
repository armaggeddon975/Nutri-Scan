// O anuncio do veredito para leitor de tela (v0.12.0).
//
// Uma regiao viva SO, montada uma vez no app e nunca desmontada: leitor de tela
// anuncia MUDANCA numa regiao que ja existia, e uma regiao que nasce junto com o
// texto pode ficar muda. Quando um veredito aparece apos uma acao - abrir um
// produto, escanear, comparar, mudar a alergia com um produto aberto -, o texto
// daqui muda e e anunciado.
//
// `polite`, e nao `assertive`: o anuncio responde a uma acao da propria pessoa,
// que esta esperando por ele; `polite` e lido assim que o leitor termina a frase
// em curso, sem cortar nada. `assertive` interromperia a leitura no meio, e num
// app em que cada produto aberto traz um veredito, interromper toda vez o
// tornaria insuportavel. O estado vem primeiro na frase, antes dos alergenicos.
//
// `vez` alterna um espaco invisivel no fim: o mesmo veredito anunciado duas
// vezes seguidas (o mesmo produto reaberto) precisa mudar o texto para ser
// lido de novo.
export function AnuncioDoVeredito({ texto = "", vez = 0 }) {
  return (
    <p id="anuncio-do-veredito" className="sr-only" aria-live="polite" aria-atomic="true">
      {texto ? `${texto}${vez % 2 ? " " : ""}` : ""}
    </p>
  );
}
