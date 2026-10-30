import { useId } from "react";
import { AlertTriangle, CircleHelp, Info, ShieldCheck } from "lucide-react";

import {
  ESTADO,
  estadoDoVeredito,
  motivoDoNaoAvaliado,
  riscosDoVeredito,
  textoDoRisco,
  tituloDoEstado,
} from "../../utils/estadoDoVeredito";

// Veredito deterministico de alergia.
//
// O estado exibido vem SEMPRE de `verdict.status`, que o motor de `shared/`
// calcula. Nada aqui e inferido do texto do modelo: se o motor disser que ha
// conflito, o alerta aparece mesmo que a resposta da IA afirme que o produto e
// seguro.
//
// O ESTADO CHEGA SEM COR (v0.12.0). Conflito, traco, sem conflito e nao
// avaliado se distinguem pelo TEXTO do titulo - e cada alergenico diz o seu
// estado ("Contem", "Pode conter"). O tom da caixa e o icone sao reforco; o
// icone e decorativo para o leitor de tela, porque o titulo ja diz tudo.
//
// PAPEL E NOME. A caixa e um grupo com nome: o titulo - e, quando ha, o nome do
// produto (`rotulo`). Na comparacao, sao duas caixas na mesma tela, e cada uma
// diz de qual produto e. O anuncio, quando o veredito aparece apos uma acao, e
// da regiao `AnuncioDoVeredito`, que ja existe na pagina antes da mudanca; esta
// caixa nao e regiao viva - dentro do log do assistente, seria anuncio em dobro.
const TOM = {
  [ESTADO.conflito]: { tone: "danger", Icon: AlertTriangle },
  [ESTADO.traco]: { tone: "warning", Icon: Info },
  [ESTADO.semConflito]: { tone: "safe", Icon: ShieldCheck },
  [ESTADO.naoAvaliado]: { tone: "neutral", Icon: CircleHelp },
};

// `origem` (v0.10.0): a comparacao e a tela do produto passam a propria frase;
// o assistente continua com a de sempre.
export function AllergyVerdict({
  verdict,
  rotulo = "",
  origem = "Verificação do próprio app. O texto abaixo é a explicação do assistente.",
}) {
  const idTitulo = useId();
  const estado = estadoDoVeredito(verdict);
  // Sem produto, o motor nao avaliou nada, e afirmar qualquer coisa ali seria
  // invencao: nenhum bloco.
  if (!estado) return null;

  const { tone, Icon } = TOM[estado];
  const riscos = riscosDoVeredito(verdict);
  const motivo = estado === ESTADO.naoAvaliado ? motivoDoNaoAvaliado(verdict) : null;

  return (
    <div className={`allergy-verdict ${tone}`} role="group" aria-labelledby={idTitulo}>
      <p className="allergy-verdict-title" id={idTitulo}>
        <Icon size={16} aria-hidden="true" />
        {rotulo ? <span className="sr-only">{`${rotulo}: `}</span> : null}
        {tituloDoEstado(verdict)}
      </p>
      {riscos.length > 0 && (
        <p className="allergy-verdict-tags">
          {riscos.map((risk) => (
            <span className="danger-tag" key={risk.id}>
              {textoDoRisco(risk, verdict.status)}
            </span>
          ))}
        </p>
      )}
      {motivo && <p className="allergy-verdict-alert">{motivo}</p>}
      {verdict.alert && <p className="allergy-verdict-alert">{verdict.alert}</p>}
      <p className="allergy-verdict-origin">{origem}</p>
    </div>
  );
}
