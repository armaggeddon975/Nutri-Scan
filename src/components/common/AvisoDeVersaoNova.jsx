import { RefreshCw } from "lucide-react";

// Aviso de versao nova (v0.13.0).
//
// Aparece quando o service worker de uma versao mais nova ja baixou o app e esta
// esperando. A pagina NAO recarrega sozinha - a pessoa pode estar no meio de um
// veredito. Ela atualiza quando tocar no botao; se nao tocar, a versao nova
// assume na proxima vez que o app abrir. O aviso fica ate isso acontecer.
//
// A regiao existe sempre (vazia quando nao ha versao nova): leitor de tela
// anuncia mudanca em regiao que ja existia. `polite`, como o anuncio do
// veredito: avisa sem interromper.
export function AvisoDeVersaoNova({ visivel, onAtualizar }) {
  return (
    <div className="update-region" role="status" aria-live="polite">
      {visivel ? (
        <div className="offline-notice update-notice">
          <RefreshCw size={22} aria-hidden="true" />
          <div>
            <strong>Há uma versão nova do NutriScan.</strong>
            <span>Atualize quando terminar o que está lendo. A tela recarrega.</span>
            <button className="primary-button" type="button" onClick={onAtualizar}>
              Atualizar agora
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
