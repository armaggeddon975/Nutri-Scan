import { Search } from "lucide-react";

import { SAMPLE_BARCODES, SAMPLE_QUERIES } from "../../data/foods";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

export function SearchPage({
  query,
  status,
  productAnalysis,
  onQueryChange,
  onSubmitSearch,
  onSearchProduct,
}) {
  return (
    <>
      <PageHeader eyebrow="Consulta" title="Pesquise por alimento ou código de barras." />
      <form className="search-card page-search" onSubmit={onSubmitSearch}>
        <label htmlFor="food-search-page">Alimento ou código</label>
        <div className="input-row">
          <input
            id="food-search-page"
            name="query"
            placeholder="Ex: arroz ou 3017624010701"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <button type="submit" aria-label="Buscar alimento">
            <Search size={20} aria-hidden="true" />
            Buscar
          </button>
        </div>
      </form>
      <div className="chip-list page-chips">
        {SAMPLE_QUERIES.map((sample) => (
          <button type="button" key={sample} onClick={() => onSearchProduct(sample)}>
            {sample}
          </button>
        ))}
        {SAMPLE_BARCODES.map((sample) => (
          <button type="button" key={sample.code} onClick={() => onSearchProduct(sample.code)}>
            {sample.label}
          </button>
        ))}
      </div>
      <StatusLine status={status} />
      {productAnalysis}
    </>
  );
}
