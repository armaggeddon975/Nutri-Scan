import { compararProdutos, explicarComparacao } from "../services/comparisonService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// As duas rotas usam `req.user`, preenchido por `optionalAuth` a partir da
// sessao. Nenhum campo do corpo escolhe de quem e o perfil.

export const comparar = asyncHandler(async (req, res) => {
  res.json(await compararProdutos(req, req.body));
});

export const explicar = asyncHandler(async (req, res) => {
  res.json(await explicarComparacao(req, req.body));
});
