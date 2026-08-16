import { Router } from "express";

import { login, logout, me, register } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { authRateLimit } from "../middleware/rateLimit.js";

export const authRoutes = Router();

authRoutes.post("/register", authRateLimit, register);
authRoutes.post("/login", authRateLimit, login);
authRoutes.post("/logout", logout);
authRoutes.get("/me", requireAuth, me);
