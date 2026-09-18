import { Router } from "express";

import {
  createFavorite,
  deleteFavorite,
  listFavorites,
  toggleFavoriteItem,
} from "../controllers/collectionsController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { collectionsRateLimit } from "../middleware/rateLimit.js";

export const favoritesRoutes = Router();

favoritesRoutes.use(requireAuth, collectionsRateLimit);

favoritesRoutes.get("/", listFavorites);
favoritesRoutes.post("/", createFavorite);
favoritesRoutes.post("/toggle", toggleFavoriteItem);
favoritesRoutes.delete("/:id", deleteFavorite);
