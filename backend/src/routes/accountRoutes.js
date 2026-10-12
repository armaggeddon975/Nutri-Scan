import { Router } from "express";

import { excluir, exportar } from "../controllers/accountController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { authRateLimit, exportRateLimit } from "../middleware/rateLimit.js";

// Direitos do titular (v0.8.0). As duas rotas exigem sessao valida.
export const accountRoutes = Router();

// Exportar: `requireAuth` antes do limitador, porque o balde por usuario usa a
// identidade da sessao. Sem sessao, 401 antes de qualquer leitura.
accountRoutes.get("/export", requireAuth, exportRateLimit, exportar);

// Excluir: o limitador de AUTENTICACAO, e nao o de colecoes. Cada tentativa
// confere uma senha - e um teste de senha, e conta no mesmo balde do login.
// Ele vem antes de `requireAuth` como no login: toda tentativa conta.
accountRoutes.delete("/", authRateLimit, requireAuth, excluir);
