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

  // ERRO INTERNO (v0.7.5, item 6.4)
  //
  // O cliente recebe codigo e frase genericos. Em producao, NUNCA: stack, SQL,
  // nome de tabela, caminho de arquivo nem mensagem de driver. Qualquer desses
  // ensina a um atacante como o sistema e por dentro - a mensagem do `pg`, por
  // exemplo, cita nome de coluna e de restricao.
  //
  // O detalhe vai para o LOG do servidor, que e onde ele serve. Ate a v0.7.4 o
  // erro era descartado: o cliente nao via, mas o operador tambem nao, e um 500
  // em producao sumia sem rastro.
  console.error("[erro interno]", error);

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Erro interno do servidor.",
      ...(!isProduction() ? { details: error.message } : {}),
    },
  });
}
