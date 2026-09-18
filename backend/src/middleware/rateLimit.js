import rateLimit from "express-rate-limit";

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

export const assistantRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Historico e favoritos sao rotas de escrita frequente: cada produto aberto
// gera um POST de historico. O limite e mais folgado que o de auth, que protege
// senha, e mais folgado que o do assistente, que custa dinheiro por chamada -
// mas ainda impede que um script encha a tabela de um usuario.
export const collectionsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
