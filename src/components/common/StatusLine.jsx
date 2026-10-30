import { useRef } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShieldAlert, Sparkles } from "lucide-react";

export const STATUS_ICONS = {
  ready: Sparkles,
  loading: Loader2,
  success: CheckCircle2,
  warning: ShieldAlert,
  error: AlertCircle,
};

// `silenciosa` (v0.12.0): a linha continua na tela, mas deixa de ser regiao
// viva. A tela do codigo usa isso quando o erro do campo ja e anunciado pelo
// proprio campo - sem isso, a mesma recusa era lida duas vezes.
//
// O texto e remontado a cada status NOVO: a mesma mensagem duas vezes seguidas
// (o mesmo codigo recusado de novo) precisa ser anunciada de novo, e texto que
// nao muda nao e lido.
export function StatusLine({ status, silenciosa = false }) {
  const Icon = STATUS_ICONS[status.type] || Sparkles;
  const anterior = useRef(status);
  const versao = useRef(0);
  if (anterior.current !== status) {
    anterior.current = status;
    versao.current += 1;
  }

  const viva = silenciosa ? { "aria-live": "off" } : { role: "status", "aria-live": "polite" };

  return (
    <div className={`status-line ${status.type}`} {...viva}>
      <Icon size={18} className={status.type === "loading" ? "spin" : ""} aria-hidden="true" />
      <span key={versao.current}>{status.message}</span>
    </div>
  );
}
