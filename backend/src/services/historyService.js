import { HISTORY_LIMIT } from "../config/collections.js";
import {
  clearHistory,
  deleteHistoryItem,
  listHistory,
  pruneHistory,
  recordView,
} from "../repositories/historyRepository.js";
import { AppError } from "../utils/AppError.js";
import { productRefSchema, itemIdSchema } from "../utils/validation.js";

// O `userId` que chega aqui vem SEMPRE de `req.user.id`, derivado da sessao
// pelo `requireAuth`. Nenhuma funcao deste modulo aceita identidade vinda do
// corpo da requisicao, e nenhuma delas deve passar a aceitar: o parametro se
// chama `userId` justamente para que um `req.body.userId` chegando aqui seja
// visivel na revisao.

export async function getHistory(userId) {
  return listHistory(userId);
}

export async function registerView(userId, payload) {
  const produto = productRefSchema.parse(payload);
  const item = await recordView(userId, produto);

  // A poda roda depois de gravar, e nao antes, porque a gravacao pode ser uma
  // ATUALIZACAO de item ja existente - nesse caso nada entrou e nada precisa
  // sair. Contar antes trataria revisita como item novo e descartaria um item
  // valido sem motivo.
  const removidos = await pruneHistory(userId, HISTORY_LIMIT);

  return { item, removidos };
}

export async function removeHistoryItem(userId, itemId) {
  const id = itemIdSchema.parse(itemId);
  const removido = await deleteHistoryItem(userId, id);

  // Item de outro usuario e item inexistente produzem a MESMA resposta. Se o
  // primeiro devolvesse 403 e o segundo 404, a diferenca contaria ao atacante
  // quais ids existem na tabela de outra pessoa.
  if (!removido) {
    throw new AppError("NOT_FOUND", "Item não encontrado.", 404);
  }

  return { id: removido };
}

export async function clearAllHistory(userId) {
  const removidos = await clearHistory(userId);
  return { removidos };
}
