import { Heart, History, Trash2 } from "lucide-react";

import { PageHeader } from "../../components/common/PageHeader";
import { StatusLine } from "../../components/common/StatusLine";

// Historico e favoritos.
//
// A tela NAO mostra veredito de alergia nos itens da lista, e isso e
// deliberado: o veredito depende do perfil atual e e calculado quando o produto
// e aberto. Mostrar um selo aqui exigiria recalcular tudo a cada render ou
// guardar o resultado - e guardar e exatamente o que nao pode acontecer.

function ListaDeProdutos({ itens, vazio, onAbrir, onRemover, rotuloRemover }) {
  if (!itens.length) {
    return <p className="collection-empty">{vazio}</p>;
  }

  return (
    <ul className="collection-list">
      {itens.map((item) => (
        <li key={item.id} className="collection-item">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" aria-hidden="true" className="collection-thumb" />
          ) : (
            <span className="collection-thumb collection-thumb-empty" aria-hidden="true" />
          )}

          <button
            type="button"
            className="collection-open"
            onClick={() => onAbrir(item.productCode)}
          >
            {/* Nome e marca vem da Open Food Facts, fonte nao confiavel. O React
                escapa texto por padrao, entao eles entram como conteudo e nunca
                como marcacao. */}
            <strong>{item.productName}</strong>
            {item.productBrand ? <small>{item.productBrand}</small> : null}
          </button>

          <button
            type="button"
            className="collection-remove"
            onClick={() => onRemover(item)}
            aria-label={`${rotuloRemover}: ${item.productName}`}
          >
            <Trash2 size={20} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CollectionsPage({
  currentUser,
  history,
  favorites,
  status,
  onOpenProduct,
  onRemoveHistoryItem,
  onClearHistory,
  onRemoveFavorite,
}) {
  return (
    <>
      <PageHeader
        eyebrow="Seus produtos"
        title="O que você já viu e marcou."
        subtitle={
          currentUser
            ? "Salvo na sua conta e disponível em qualquer aparelho."
            : "Sem conta, isso fica só neste aparelho e não aparece em outro."
        }
      />

      <section className="collection-block" aria-label="Favoritos">
        <div className="collection-head">
          <h2>
            <Heart size={22} aria-hidden="true" />
            Favoritos
          </h2>
          <span className="collection-count">{favorites.length}</span>
        </div>
        <ListaDeProdutos
          itens={favorites}
          vazio="Você ainda não marcou nenhum produto."
          onAbrir={onOpenProduct}
          onRemover={onRemoveFavorite}
          rotuloRemover="Desmarcar favorito"
        />
      </section>

      <section className="collection-block" aria-label="Histórico">
        <div className="collection-head">
          <h2>
            <History size={22} aria-hidden="true" />
            Histórico
          </h2>
          <span className="collection-count">{history.length}</span>
          {history.length ? (
            <button type="button" className="collection-clear" onClick={onClearHistory}>
              Limpar tudo
            </button>
          ) : null}
        </div>
        <ListaDeProdutos
          itens={history}
          vazio="Nenhum produto aberto ainda."
          onAbrir={onOpenProduct}
          onRemover={onRemoveHistoryItem}
          rotuloRemover="Remover do histórico"
        />
      </section>

      <StatusLine status={status} />
    </>
  );
}
