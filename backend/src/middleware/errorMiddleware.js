import { ZodError } from "zod";

import { AppError } from "../utils/AppError.js";
import { isProduction } from "../config/env.js";

export function notFoundHandler(_req, _res, next) {
  next(new AppError("NOT_FOUND", "Rota não encontrada.", 404));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos.",
        details: error.issues.map((issue) => issue.message),
      },
    });
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }

  if (error.code === "DATABASE_NOT_CONFIGURED") {
    return res.status(503).json({
      error: {
        code: "DATABASE_NOT_CONFIGURED",
        message: "Banco de dados não configurado.",
      },
    });
  }

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Erro interno do servidor.",
      ...(!isProduction() ? { details: error.message } : {}),
    },
  });
}
