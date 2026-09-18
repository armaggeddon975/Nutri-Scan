import {
  clearAllHistory,
  getHistory,
  registerView,
  removeHistoryItem,
} from "../services/historyService.js";
import {
  addToFavorites,
  getFavorites,
  removeFromFavorites,
  toggleFavorite,
} from "../services/favoritesService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Em TODAS as rotas daqui a identidade vem de `req.user.id`, populado pelo
// `requireAuth` a partir da sessao. `req.body.userId` nunca e lido - se chegar,
// e simplesmente ignorado pelo schema de validacao, que so aceita os campos do
// produto.

export const listHistory = asyncHandler(async (req, res) => {
  const items = await getHistory(req.user.id);
  res.json({ items });
});

export const recordHistory = asyncHandler(async (req, res) => {
  const { item } = await registerView(req.user.id, req.body);
  res.status(201).json({ item });
});

export const deleteHistoryItem = asyncHandler(async (req, res) => {
  const { id } = await removeHistoryItem(req.user.id, req.params.id);
  res.json({ id });
});

export const clearHistory = asyncHandler(async (req, res) => {
  const { removidos } = await clearAllHistory(req.user.id);
  res.json({ removed: removidos });
});

export const listFavorites = asyncHandler(async (req, res) => {
  const items = await getFavorites(req.user.id);
  res.json({ items });
});

export const createFavorite = asyncHandler(async (req, res) => {
  const { favorito, criado } = await addToFavorites(req.user.id, req.body);
  res.status(criado ? 201 : 200).json({ item: favorito });
});

export const toggleFavoriteItem = asyncHandler(async (req, res) => {
  const resultado = await toggleFavorite(req.user.id, req.body);
  res.json(resultado);
});

export const deleteFavorite = asyncHandler(async (req, res) => {
  const { id } = await removeFromFavorites(req.user.id, req.params.id);
  res.json({ id });
});
