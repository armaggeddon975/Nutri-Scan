import { FAVORITES_LIMIT } from "../config/collections.js";
import {
  addFavorite,
  countFavorites,
  findFavoriteByCode,
  listFavorites,
  removeFavorite,
  removeFavoriteByCode,
} from "../repositories/favoritesRepository.js";
import { AppError } from "../utils/AppError.js";
import { productRefSchema, itemIdSchema } from "../utils/validation.js";

// Como no historico, `userId` vem sempre da sessao.

export async function getFavorites(userId) {
  return listFavorites(userId);
}

export async function addToFavorites(userId, payload) {
  const produto = productRefSchema.parse(payload);

  // Marcar de novo algo que ja esta marcado nao pode esbarrar no limite: a
  // operacao nao aumenta a contagem. Sem esta checagem, um usuario no teto nao
  // conseguiria nem reenviar um favorito que ja tem.
  const jaExiste = await findFavoriteByCode(userId, produto.productCode);
  if (jaExiste) {
    return { favorito: jaExiste, criado: false };
  }

  const total = await countFavorites(userId);
  if (total >= FAVORITES_LIMIT) {
    // Erro, e nao poda silenciosa: favorito e escolha explicita do usuario, e
    // descartar a mais antiga para caber a nova apagaria uma decisao dele.
    throw new AppError(
      "FAVORITES_LIMIT_REACHED",
      `Você atingiu o limite de ${FAVORITES_LIMIT} favoritos. Remova algum para adicionar outro.`,
      409,
    );
  }

  return addFavorite(userId, produto);
}

export async function removeFromFavorites(userId, favoriteId) {
  const id = itemIdSchema.parse(favoriteId);
  const removido = await removeFavorite(userId, id);

  // Mesma resposta para item de outro usuario e item inexistente.
  if (!removido) {
    throw new AppError("NOT_FOUND", "Favorito não encontrado.", 404);
  }

  return { id: removido };
}

// Usado pelo botao de marcar/desmarcar da interface, que conhece o codigo do
// produto na tela mas nao o id da linha no banco.
export async function toggleFavorite(userId, payload) {
  const produto = productRefSchema.parse(payload);

  const removido = await removeFavoriteByCode(userId, produto.productCode);
  if (removido) {
    return { favoritado: false, id: removido };
  }

  const { favorito } = await addToFavorites(userId, produto);
  return { favoritado: true, favorito };
}
