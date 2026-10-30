import { Search } from "lucide-react";

import { SAMPLE_BARCODES, SAMPLE_QUERIES } from "../../data/foods";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

const ID_CAMPO = "food-search-page";
const ID_ERRO = "food-search-page-erro";

export function SearchPage({
  query,
  status,
  productAnalysis,
  onQueryChange,
  onSubmitSearch,
  onSearchProduct,
}) {
  // Codigo recusado (v0.12.0): o erro fica ligado ao campo, como na tela da
  // camera - aria-describedby, aria-invalid e role="alert". So a recusa do
  // codigo marca o campo; "nao encontrado" e resultado, nao erro de digitacao.
  const erroNoCampo = Boolean(status?.campo) && Boolean(status?.message);
  return (
    <>
      <PageHeader eyebrow="Buscar" title="Procure um alimento pelo nome." />
      <form className="search-card page-search" onSubmit={onSubmitSearch}>
        <label htmlFor={ID_CAMPO}>Alimento ou código</label>
        <div className="input-row">
          <input
            id={ID_CAMPO}
            name="query"
            placeholder="Ex: arroz ou 3017624010701"
            value={query}
            aria-describedby={erroNoCampo ? ID_ERRO : undefined}
            aria-invalid={erroNoCampo || undefined}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <button type="submit" aria-label="Buscar alimento">
            <Search size={20} aria-hidden="true" />
            Buscar
          </button>
        </div>
        {erroNoCampo && (
          <p id={ID_ERRO} className="field-error" role="alert">
            {status.message}
          </p>
        )}
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
      <StatusLine status={status} silenciosa={erroNoCampo} />
      {productAnalysis}
    </>
  );
}
