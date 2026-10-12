import { ZodError } from "zod";

import { AppError } from "../utils/AppError.js";
import { isProduction } from "../config/env.js";

// JSON MALFORMADO NO CORPO (v0.7.6, achado O2)
//
// `express.json()` recusa corpo que nao e JSON com um erro que traz
// `statusCode: 400`, `type: "entity.parse.failed"` e `expose: true`. Ate a
// v0.7.5 o handler descartava isso e respondia 500: erro do CLIENTE virando
// alerta de SERVIDOR, com "[erro interno]" no log - medido pelo auditor em
// producao e reproduzido nesta versao.
//
// A RESTRICAO, e por que ela e estreita assim
//
// O caminho facil seria "respeitar o status de qualquer erro com
// `expose: true`". Isso entregaria a escolha do status - e, se a mensagem viesse
// junto, do texto - a qualquer biblioteca que lance um erro com esses campos. Um
// erro interno de terceiro poderia sair como 401, 404 ou 418, com detalhe dele.
// `expose: true` do body-parser nao e autorizacao geral.
//
// Por isso so UM caso e reconhecido, por dois sinais ao mesmo tempo: o `type`
// que o body-parser grava na falha de parse, e o erro ser um `SyntaxError` - que
// e o que o parse do JSON lanca. Um erro de outra biblioteca que apenas copie o
// `type` nao passa. E mesmo no caso reconhecido, o status e a mensagem saem
// DAQUI, fixos: nada do erro chega ao cliente.
//
// Qualquer outro erro, com o status que trouxer, continua caindo no ramo de erro
// interno: 500, frase generica.
function ehFalhaDeParseDoCorpo(error) {
  return error instanceof SyntaxError && error.type === "entity.parse.failed";
}

// CORPO GRANDE DEMAIS (para a v0.8.0, por decisao do dono do projeto)
//
// O mesmo defeito do O2, no caso vizinho: corpo acima do limite do
// `express.json()` (64 kB) respondia 500. A v0.7.6 deixou de fora de proposito,
// porque o prompt dela restringia a correcao ao parse.
//
// Mesma regra de la: um caso so, reconhecido por dois sinais medidos no erro
// real - a classe `PayloadTooLargeError`, que o body-parser cria, e o `type`
// `entity.too.large`. Copiar so o `type` nao basta. O 413 e a mensagem saem
// DAQUI; nem o status nem o texto do erro ("request entity too large") chegam
// ao cliente.
function ehCorpoGrandeDemais(error) {
  return error?.constructor?.name === "PayloadTooLargeError" && error.type === "entity.too.large";
}

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

  if (ehFalhaDeParseDoCorpo(error)) {
    return res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "O corpo da requisição não é JSON válido.",
      },
    });
  }

  if (ehCorpoGrandeDemais(error)) {
    return res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "O corpo da requisição é grande demais.",
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
