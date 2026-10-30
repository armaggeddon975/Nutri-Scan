import { Barcode, CircleGauge, Heart, Scale, Utensils } from "lucide-react";

import { AllergyVerdict } from "../assistant/AllergyVerdict";
import { OfflineNotice } from "../common/OfflineNotice";
import { dataDoAparelho, REDE_LENTA, SEM_INTERNET } from "../../services/offlineLookup";
import { formatTag } from "../../utils/formatting";
import { getIngredients, getProductName } from "../../utils/product";
import { getNutriScore, getNutriScoreClass } from "../../utils/nutrition";

export function ProductAnalysis({
  product,
  localMatches,
  nutrientRows,
  allergyScan,
  alertLevels,
  productScore,
  onSelectProduct,
  isFavorite = false,
  onToggleFavorite,
  onCompare,
  origemDoDado = null,
  veredito = null,
  // Nome da v0.11.0, quando o veredito so aparecia para o produto do aparelho.
  vereditoDoAparelho = null,
}) {
  const vereditoMostrado = veredito ?? vereditoDoAparelho;
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
        {/* Produto lido do APARELHO (v0.11.0): diz de onde veio e de quando, e
            mostra o veredito refeito agora, com o perfil atual. */}
        {origemDoDado?.fonte === "aparelho" ? (
          <div className="offline-product">
            <OfflineNotice titulo={`Do aparelho · guardado em ${dataDoAparelho(origemDoDado.guardadoEm)}`}>
              {origemDoDado.motivo === SEM_INTERNET
                ? "Sem internet. Estes são os dados guardados neste aparelho."
                : origemDoDado.motivo === REDE_LENTA
                  ? "A internet está demorando. Enquanto isso, os dados guardados neste aparelho."
                  : "A internet não respondeu. Estes são os dados guardados neste aparelho."}{" "}
              O alerta de alergia foi refeito agora, com o seu perfil.
            </OfflineNotice>
          </div>
        ) : null}
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
            {/* O botao fica no cabecalho do produto, nao numa barra de acoes
                separada: e ali que a pessoa esta olhando quando decide. */}
            {onToggleFavorite ? (
              <button
                type="button"
                className={isFavorite ? "favorite-button on" : "favorite-button"}
                onClick={onToggleFavorite}
                aria-pressed={isFavorite}
              >
                <Heart size={20} aria-hidden="true" />
                {isFavorite ? "Nos favoritos" : "Favoritar"}
              </button>
            ) : null}
            {/* Comparar (v0.10.0): so produto com codigo de barras - a comparacao
                e entre dois codigos. Alimento da base local nao tem codigo. */}
            {onCompare && product.code && !product.isLocal ? (
              <button type="button" className="compare-button" onClick={onCompare}>
                <Scale size={20} aria-hidden="true" />
                Comparar com outro produto
              </button>
            ) : null}
            <div className="product-meta">
              <span>{product.source}</span>
              {product.quantity && <span>{product.quantity}</span>}
              <span className={`nutri-score grade-${getNutriScoreClass(product)}`}>
                Nutri-Score {getNutriScore(product)}
              </span>
            </div>
          </div>
        </div>

        {/* O VEREDITO LOGO DEPOIS DO NOME (v0.12.0). Antes, o conflito aparecia
            so na coluna lateral, como o nome do alergenico em vermelho - quem
            nao distingue a cor, ou le a tela em ordem, nao recebia o estado.
            Agora o estado vem por escrito, no topo, para produto da rede, da
            base local ou do aparelho. */}
        {vereditoMostrado ? (
          <AllergyVerdict
            verdict={vereditoMostrado}
            rotulo={getProductName(product)}
            origem={
              origemDoDado?.fonte === "aparelho"
                ? "Verificação do próprio app, feita agora neste aparelho."
                : "Verificação do próprio app, com o seu perfil."
            }
          />
        ) : null}

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

        {/* O bloco "Alertas do perfil" saiu (v0.12.0): o veredito, com o estado
            por escrito, esta no topo da tela. */}
        <article className="info-block">
          <div className="block-heading">
            <h4>Pontos de atenção</h4>
          </div>
          <div className="tag-list">
            {allergyScan.allRisks.length ? (
              allergyScan.allRisks.map((risk) => (
                <span className="soft-tag" key={risk.id}>
                  {risk.severity === "traces" ? `Pode conter ${risk.label}` : `Contém ${risk.label}`}
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
