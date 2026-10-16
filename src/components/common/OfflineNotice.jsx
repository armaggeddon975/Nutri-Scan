import { WifiOff } from "lucide-react";

// Aviso de dado que veio do APARELHO, e nao da internet (v0.11.0).
//
// Dado offline nunca se passa por dado fresco: onde ele aparece, este aviso
// diz de onde veio e de quando e.
export function OfflineNotice({ titulo, children }) {
  return (
    <div className="offline-notice" role="status">
      <WifiOff size={24} aria-hidden="true" />
      <div>
        <strong>{titulo}</strong>
        {children ? <span>{children}</span> : null}
      </div>
    </div>
  );
}
