import { Barcode, Camera, CameraOff, Flashlight, FlashlightOff, Search } from "lucide-react";

import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

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
          <form className="search-card" onSubmit={onSubmitSearch}>
            <label htmlFor="barcode-page">Digitar código manualmente</label>
            <div className="input-row">
              <input
                id="barcode-page"
                name="query"
                inputMode="numeric"
                placeholder="Ex: 3017624010701"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
              />
              <button type="submit" aria-label="Buscar código">
                <Search size={20} aria-hidden="true" />
              </button>
            </div>
          </form>
          <StatusLine status={status} />
        </div>
      </section>
      {productAnalysis}
    </>
  );
}
