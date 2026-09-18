import { Router } from "express";

import {
  clearHistory,
  deleteHistoryItem,
  listHistory,
  recordHistory,
} from "../controllers/collectionsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { collectionsRateLimit } from "../middleware/rateLimit.js";

// `requireAuth` em todas: sem sessao valida, 401 antes de qualquer consulta.
// Nao existe variante com `optionalAuth` aqui de proposito - visitante nao
// grava no PostgreSQL, e uma rota que aceita visitante seria o caminho para
// isso acontecer por engano.
export const historyRoutes = Router();

historyRoutes.use(requireAuth, collectionsRateLimit);

historyRoutes.get("/", listHistory);
historyRoutes.post("/", recordHistory);
historyRoutes.delete("/:id", deleteHistoryItem);
historyRoutes.delete("/", clearHistory);
