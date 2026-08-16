import { Router } from "express";

import { profile, updateProfileAllergies } from "../controllers/profileController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

export const profileRoutes = Router();

profileRoutes.get("/", requireAuth, profile);
profileRoutes.put("/allergies", requireAuth, updateProfileAllergies);
