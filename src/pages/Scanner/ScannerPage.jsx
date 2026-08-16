import { Barcode, Camera, CameraOff, Search } from "lucide-react";

import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

export function ScannerPage({
  query,
  status,
  scannerState,
  videoRef,
  productAnalysis,
  onQueryChange,
  onSubmitSearch,
  onStartScanner,
  onStopScanner,
}) {
  return (
    <>
      <PageHeader eyebrow="Scan" title="Escaneie o código de barras do produto." />
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
            <button className="secondary-button" onClick={onStopScanner}>
              <CameraOff size={20} aria-hidden="true" />
              Desligar câmera
            </button>
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
