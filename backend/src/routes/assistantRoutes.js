import { Router } from "express";

import { chat } from "../controllers/assistantController.js";
import { optionalAuth } from "../middleware/authMiddleware.js";
import { assistantRateLimit } from "../middleware/rateLimit.js";

export const assistantRoutes = Router();

assistantRoutes.post("/chat", assistantRateLimit, optionalAuth, chat);
