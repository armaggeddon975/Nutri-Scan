import { Router } from "express";

import { comparar, explicar } from "../controllers/compareController.js";
import { optionalAuth } from "../middleware/authMiddleware.js";
import { assistantRateLimit, compareRateLimit } from "../middleware/rateLimit.js";

// Comparacao de dois produtos (v0.10.0). Visitante pode comparar, com as
// alergias do proprio request, como no assistente; com sessao, vale o perfil do
// PostgreSQL. `optionalAuth` vem antes do limitador porque o balde por usuario
// usa a identidade da sessao.
export const compareRoutes = Router();

compareRoutes.post("/", optionalAuth, compareRateLimit, comparar);

// A explicacao chama o modelo: alem do teto da comparacao, passa pelo MESMO
// balde do assistente. Ele vem por ultimo, para que uma requisicao recusada
// pelo teto da comparacao nao gaste a cota de IA.
compareRoutes.post("/explain", optionalAuth, compareRateLimit, assistantRateLimit, explicar);
