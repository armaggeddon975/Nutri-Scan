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
//
// CONTAGEM POR USUARIO, NAO POR IP
//
// Defeito D1 da auditoria externa da v0.7.0: a suite de integracao roda todos
// os testes contra o mesmo servidor, do mesmo IP, dentro da mesma janela. F4
// sozinho faz 201 requisicoes e H3 faz mais de 100; somados aos demais, o teto
// de 300 por IP estourava no oitavo teste. Dali em diante o servidor respondia
// o texto "Too many requests" e o harness quebrava ao tentar interpretar como
// JSON. Nove testes falhavam - entre eles I1, I2 e I3, os de ISOLAMENTO ENTRE
// CONTAS. Um teste de isolamento que nunca roda nao protege nada.
//
// A chave passou a ser o id do usuario da sessao. Isso conserta o harness sem
// afrouxar nada, e melhora a producao por um motivo independente: atras de NAT
// corporativo ou CGNAT de operadora - comum no celular, que e onde este app
// vive - varios usuarios compartilham um IP, e hoje um deles sozinho consumia
// a cota de todos. O limite de 300 continua identico; o que mudou foi a quem
// ele se aplica.
//
// A reserva por IP cobre o caso sem sessao. Na pratica ela quase nao e usada
// aqui, porque `requireAuth` roda ANTES deste middleware e devolve 401 sem
// sessao valida - mas ela existe para que este limitador continue seguro se
// alguem o montar numa rota publica no futuro.
//
// Nao existe bypass. Nenhuma variavel de ambiente, cabecalho ou parametro
// desliga este limitador: um interruptor desses e uma porta, e uma porta que
// possa ser aberta em producao troca um defeito de teste por vulnerabilidade.
export function collectionsRateLimitKey(req) {
  const userId = req?.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${req?.ip ?? "desconhecido"}`;
}

export const collectionsRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: collectionsRateLimitKey,
});
