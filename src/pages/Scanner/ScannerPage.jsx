import { Barcode, Camera, CameraOff, Flashlight, FlashlightOff, Search } from "lucide-react";

import { normalizarEntrada } from "../../../shared/barcode.js";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

const ID_CAMPO = "barcode-page";
const ID_DICA = "barcode-page-dica";
const ID_ERRO = "barcode-page-erro";
const ID_NORMALIZACAO = "barcode-page-normalizacao";

export function ScannerPage({
  query,
  status,
  scannerState,
  videoRef,
  productAnalysis,
  torch = { available: false, on: false },
  onQueryChange,
  onSubmitSearch,
  onStartScanner,
  onStopScanner,
  onToggleTorch,
}) {
  const temErro = status?.type === "warning" || status?.type === "error";
  const buscando = status?.type === "loading";

  // A limpeza de espaco e traco precisa ser VISIVEL antes de a pessoa enviar.
  // Remover caractere em silencio muda o codigo sem ela perceber, que e
  // exatamente a classe de erro que a conferencia existe para evitar.
  const { codigo: codigoLimpo, removidos } = normalizarEntrada(query);
  const mostrarNormalizacao = removidos > 0 && codigoLimpo.length > 0;

  const descritores = [ID_DICA];
  if (mostrarNormalizacao) descritores.push(ID_NORMALIZACAO);
  if (temErro) descritores.push(ID_ERRO);

  return (
    <>
      <PageHeader eyebrow="Câmera" title="Aponte a câmera para o código de barras." />
      <section className="scan-page-grid">
        <div className="scanner-stage">
          <video
            ref={videoRef}
            className="camera-preview"
            muted
            playsInline
            aria-label="Visualização da câmera"
          />
          {scannerState === "idle" && (
            <div className="camera-placeholder">
              <Barcode size={70} strokeWidth={1.4} aria-hidden="true" />
            </div>
          )}
          <div className="scan-frame" aria-hidden="true" />
        </div>
        <div className="scan-controls">
          {scannerState === "idle" ? (
            <button className="primary-button" onClick={onStartScanner}>
              <Camera size={20} aria-hidden="true" />
              Ligar câmera
            </button>
          ) : (
            <div className="scan-actions">
              <button className="secondary-button" onClick={onStopScanner}>
                <CameraOff size={20} aria-hidden="true" />
                Desligar câmera
              </button>
              {torch.available && (
                <button
                  className="secondary-button"
                  onClick={onToggleTorch}
                  aria-pressed={torch.on}
                >
                  {torch.on ? (
                    <FlashlightOff size={20} aria-hidden="true" />
                  ) : (
                    <Flashlight size={20} aria-hidden="true" />
                  )}
                  {torch.on ? "Desligar lanterna" : "Ligar lanterna"}
                </button>
              )}
            </div>
          )}

          {/* O campo fica SEMPRE visivel, e nao so quando a camera falha.
              Muita gente prefere digitar: e mais rapido que enquadrar uma
              embalagem amassada, e funciona sem permissao de camera. */}
          <form className="search-card" onSubmit={onSubmitSearch}>
            <label htmlFor={ID_CAMPO}>Ou digite o código</label>
            <div className="input-row">
              <input
                id={ID_CAMPO}
                name="query"
                type="text"
                inputMode="numeric"
                pattern="[0-9\s-]*"
                autoComplete="off"
                enterKeyHint="search"
                placeholder="Ex: 3017624010701"
                value={query}
                aria-describedby={descritores.join(" ")}
                aria-invalid={temErro || undefined}
                onChange={(event) => onQueryChange(event.target.value)}
              />
              <button type="submit" aria-label="Buscar código" disabled={buscando}>
                <Search size={20} aria-hidden="true" />
              </button>
            </div>

            <p id={ID_DICA} className="field-hint">
              O código tem 8, 12 ou 13 números. Pode digitar com espaço ou traço.
            </p>

            {mostrarNormalizacao && (
              <p id={ID_NORMALIZACAO} className="field-hint">
                Vou buscar <strong>{codigoLimpo}</strong>.
              </p>
            )}

            {/* `role="alert"` faz o leitor de tela anunciar a recusa assim que
                ela aparece. Sem isso, quem usa leitor envia o codigo e nao
                recebe retorno nenhum. */}
            {temErro && (
              <p id={ID_ERRO} className="field-error" role="alert">
                {status.message}
              </p>
            )}
          </form>

          <StatusLine status={status} />
        </div>
      </section>
      {productAnalysis}
    </>
  );
}
