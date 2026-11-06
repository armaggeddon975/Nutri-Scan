import { AlertTriangle, CircleCheck, Info } from "lucide-react";

import { avaliarTabelaNutricional, CONFIANCA, listarEmPortugues } from "../../utils/confiancaDaTabela";

// Selo de confianca da tabela nutricional (pedido do dono em 06/11/2026).
//
// Diz se a tabela que a pessoa ve esta completa e se as contas dela batem. Nao
// diz que os numeros estao certos: quem sabe e o rotulo da embalagem, e por
// isso o selo manda conferir a embalagem quando algo falta ou nao bate.
//
// O estado esta no titulo escrito, nao so na cor (criterio 1.4.1 da WCAG, o
// mesmo do veredito de alergia). Sem tabela nenhuma, o selo nao aparece: o
// bloco ja diz "Sem tabela nutricional. Confira a embalagem."
export function SeloDaTabela({ product }) {
  const { estado, faltando, problemas } = avaliarTabelaNutricional(product);
  if (estado === CONFIANCA.SEM_TABELA) return null;

  // Alimento da base local (arroz cozido, banana) nao tem embalagem para conferir.
  const confira = product?.isLocal ? "" : " Confira a embalagem.";
  let Icone = CircleCheck;
  let titulo = "Tabela completa";
  let texto = "Os números conferem entre si.";
  if (estado === CONFIANCA.NAO_BATE) {
    Icone = AlertTriangle;
    titulo = "Os números não batem";
    texto = `${problemas.join(" ")}${confira}`;
  } else if (estado === CONFIANCA.INCOMPLETA) {
    Icone = Info;
    titulo = "Tabela incompleta";
    texto = `${faltando.length > 1 ? "Faltam" : "Falta"}: ${listarEmPortugues(faltando)}.${confira}`;
  }

  return (
    <div className={`selo-da-tabela selo-${estado}`}>
      <Icone size={22} aria-hidden="true" />
      <p>
        <strong>{titulo}</strong> <span>{texto}</span>
      </p>
    </div>
  );
}
