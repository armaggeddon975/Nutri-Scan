import { Barcode, CircleGauge, Utensils } from "lucide-react";

import { formatTag } from "../../utils/formatting";
import { getIngredients, getProductName } from "../../utils/product";
import { getNutriScore, getNutriScoreClass } from "../../utils/nutrition";

export function ProductAnalysis({
  product,
  localMatches,
  nutrientRows,
  allergyScan,
  productScore,
  onSelectProduct,
}) {
  if (!product) {
    return (
      <section className="empty-state">
        <Barcode size={80} strokeWidth={1.25} aria-hidden="true" />
        <h3>Nenhum alimento aberto</h3>
        <p>Escaneie um código ou busque pelo nome.</p>
      </section>
    );
  }

  return (
    <div className="content-grid">
      <section className="product-section">
        <div className="product-header">
          <div className="product-image-wrap">
            {product.image_front_url ? (
              <img
                src={product.image_front_url}
                alt={getProductName(product)}
                className="product-image"
              />
            ) : (
              <Utensils size={58} strokeWidth={1.5} aria-hidden="true" />
            )}
          </div>
          <div className="product-title">
            <p>{product.brands || product.source || "Origem não informada"}</p>
            <h3>{getProductName(product)}</h3>
            <div className="product-meta">
              <span>{product.source}</span>
              {product.quantity && <span>{product.quantity}</span>}
              <span className={`nutri-score grade-${getNutriScoreClass(product)}`}>
                Nutri-Score {getNutriScore(product)}
              </span>
            </div>
          </div>
        </div>

        {localMatches.length > 1 && (
          <div className="match-strip">
            {localMatches.map((match) => (
              <button
                type="button"
                key={match.code}
                className={match.code === product.code ? "active" : ""}
                onClick={() => onSelectProduct(match)}
              >
                {getProductName(match)}
              </button>
            ))}
          </div>
        )}

        <div className={`analysis-banner ${productScore.tone}`}>
          <CircleGauge size={22} aria-hidden="true" />
          <div>
            <strong>{productScore.label}</strong>
            <span>
              {productScore.notes.length
                ? productScore.notes.join(" ")
                : product.localInsight || "Nada que exija atenção."}
            </span>
          </div>
        </div>

        <article className="info-block nutrition-block">
          <div className="block-heading">
            <h4>Tabela nutricional</h4>
            <span>
              {product.nutrition_data_per ? `Por ${product.nutrition_data_per}` : "Por 100 g"}
            </span>
          </div>
          {nutrientRows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Nutriente</th>
                  <th>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {nutrientRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>
                      {row.amount} {row.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-copy">Sem tabela nutricional. Confira a embalagem.</p>
          )}
        </article>
      </section>

      <aside className="insight-column">
        <article className="info-block">
          <div className="block-heading">
            <h4>Ingredientes</h4>
          </div>
          <p className="ingredients-copy">
            {getIngredients(product) || "Sem ingredientes. Confira a embalagem."}
          </p>
        </article>

        <article className={`info-block risk-block ${productScore.tone}`}>
          <div className="block-heading">
            <h4>Alertas do perfil</h4>
          </div>
          <div className="tag-list">
            {allergyScan.profileRisks.length ? (
              allergyScan.profileRisks.map((risk) => (
                <span className="danger-tag" key={risk.id}>
                  {risk.severity === "traces" ? `Pode conter ${risk.label}` : risk.label}
                </span>
              ))
            ) : allergyScan.hasData ? (
              <span className="quiet-tag">Sem conflito com o perfil</span>
            ) : (
              <span className="danger-tag">
                Sem dados de alergênicos — confira o rótulo físico
              </span>
            )}
          </div>
        </article>

        <article className="info-block">
          <div className="block-heading">
            <h4>Pontos de atenção</h4>
          </div>
          <div className="tag-list">
            {allergyScan.allRisks.length ? (
              allergyScan.allRisks.map((risk) => (
                <span className="soft-tag" key={risk.id}>
                  {risk.severity === "traces" ? `Pode conter ${risk.label}` : risk.label}
                </span>
              ))
            ) : allergyScan.hasData ? (
              <span className="quiet-tag">Nenhum alergênico detectado</span>
            ) : (
              <span className="quiet-tag">Sem ingredientes para conferir</span>
            )}
            {[...(product.labels_tags || []), ...(product.categories_tags || [])]
              .filter(Boolean)
              .slice(0, 6)
              .map((tag) => (
                <span className="quiet-tag" key={tag}>
                  {formatTag(tag)}
                </span>
              ))}
          </div>
        </article>
      </aside>
    </div>
  );
}
