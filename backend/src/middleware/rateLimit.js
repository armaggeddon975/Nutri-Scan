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
// DOIS TETOS QUE SE SOMAM: POR USUARIO E POR IP
//
// Historico dos dois defeitos que produziram este desenho.
//
// D1 (auditoria da v0.7.0): o limitador contava so por IP. A suite de
// integracao roda todos os testes contra o mesmo servidor, do mesmo IP, na
// mesma janela, e gasta 372 requisicoes de colecoes - numero medido, nao
// estimado. O teto de 300 por IP estourava no oitavo teste, o servidor passava
// a responder o texto "Too many requests" e o harness quebrava ao tentar ler
// aquilo como JSON. Nove testes falhavam, entre eles I1, I2 e I3, os de
// isolamento entre contas. Testes de isolamento que nunca rodam nao protegem
// nada.
//
// E1 (auditoria da v0.7.1): a correcao de D1 trocou a chave para o id do
// usuario, e o comentario que ficou no lugar afirmava que aquilo "conserta o
// harness sem afrouxar nada". A afirmacao era FALSA. Como `requireAuth` roda
// antes deste middleware, toda requisicao que chega aqui ja tem sessao, entao o
// ramo de IP nunca executava: o teto por usuario SUBSTITUIU o teto por IP em
// vez de somar a ele. O auditor externo subiu o app e mediu, criando contas do
// mesmo endereco:
//
//   conta 0: 300 aceitas, 429 na 301
//   conta 1: 300 aceitas, 429 na 301
//   conta 2: 300 aceitas, 429 na 301
//   conta 3: 300 aceitas, 429 na 301
//   MESMO IP -> 4 contas, 1200 requisicoes aceitas
//
// Nao havia mais teto por IP nenhum. Com `authRateLimit` permitindo 40 registros
// por 15 minutos, um unico endereco podia criar ~160 contas por hora e passar
// dezenas de milhares de requisicoes.
//
// Agora os dois tetos existem ao mesmo tempo e o mais restritivo vence.
//
// ORDEM: O TETO POR USUARIO E CONFERIDO PRIMEIRO
//
// Nao e detalhe de estilo. Com o teto de IP na frente, a requisicao 301 de um
// usuario abusivo passaria pelo contador de IP - incrementando-o - para so
// entao ser recusada pelo contador de usuario. O abusivo consumiria cota
// compartilhada com requisicoes que nem foram atendidas, punindo os vizinhos de
// NAT. Conferindo o usuario primeiro, a recusa acontece antes de tocar no
// contador de IP, e um unico usuario nao consegue gastar mais que a propria
// cota do orcamento do endereco.
export const TETO_COLECOES_POR_USUARIO = 300;

// TETO POR IP: 3000 por 10 minutos.
//
// O numero vem de um modelo declarado, nao de um chute.
//
// O que ele precisa acomodar, medido:
//
//   suite de integracao de colecoes   372 requisicoes de 127.0.0.1
//   scripts/e2e-real.js               9 requisicoes
//
// A restricao que manda, porem, nao e o teste - e o caso NAT/CGNAT, que foi o
// motivo de existir o teto por usuario. Atras de NAT corporativo ou de CGNAT de
// operadora - comum no celular, que e onde este app vive - varios usuarios
// legitimos compartilham um endereco. Um teto por IP perto de 300 puniria
// exatamente essas pessoas, desfazendo o ganho da v0.7.1.
//
// O modelo: uso intenso de verdade gira em torno de 60 requisicoes de colecoes
// por 10 minutos por pessoa (cada produto aberto grava uma linha de historico,
// mais as leituras de lista). 3000 acomoda cerca de 50 pessoas nesse ritmo atras
// do mesmo endereco, ou 10 pessoas gastando a cota individual inteira.
//
// Do outro lado, ele contem: antes desta versao um endereco passava 1200
// requisicoes com 4 contas e nao tinha teto algum; agora para em 3000 por
// janela, independentemente de quantas contas o atacante criar.
//
// A folga sobre a maior medicao e de 8,06x (3000 / 372). Ela e generosa de
// proposito: o teto por IP e rede de contencao contra abuso de multiplas
// contas, nao o controle primario, e voltar a quebrar a suite de integracao
// seria repetir D1.
export const TETO_COLECOES_POR_IP = 3000;

export const JANELA_COLECOES_MS = 10 * 60 * 1000;

// Um endereco IPv6 residencial costuma vir com um bloco /64 inteiro - 2^64
// enderecos. Sem normalizar, quem tem esse bloco troca de endereco a cada
// requisicao e ganha um balde novo toda vez, o que transforma o teto por IP em
// enfeite. A chave usa o prefixo /64, que e a unidade que a operadora entrega.
//
// IPv4, e IPv6 mapeando IPv4 (`::ffff:203.0.113.9`), usam o endereco inteiro.
export function normalizarIp(ip) {
  if (!ip) return "desconhecido";
  const texto = String(ip).trim().toLowerCase();
  if (!texto) return "desconhecido";

  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(texto);
  if (mapeado) return mapeado[1];

  if (!texto.includes(":")) return texto;

  // A partir daqui e IPv6. `expandir` resolve o "::" para que o corte do /64
  // caia sempre nos quatro primeiros grupos de verdade.
  const [semZona] = texto.split("%");
  const partes = semZona.split("::");
  let grupos;
  if (partes.length === 2) {
    const esquerda = partes[0] ? partes[0].split(":") : [];
    const direita = partes[1] ? partes[1].split(":") : [];
    const faltando = 8 - esquerda.length - direita.length;
    if (faltando < 0) return semZona;
    grupos = [...esquerda, ...Array(faltando).fill("0"), ...direita];
  } else {
    grupos = semZona.split(":");
  }

  if (grupos.length < 4) return semZona;
  return `${grupos.slice(0, 4).map((g) => g || "0").join(":")}::/64`;
}

// A identidade do balde de usuario vem da SESSAO. Nenhum cabecalho, query
// string ou cookie participa: `req.user` e preenchido por `requireAuth`, que
// valida o token contra o banco.
//
// A reserva por IP cobre a requisicao sem sessao. Ela quase nao e usada nas
// rotas de colecoes, porque `requireAuth` devolve 401 antes - mas existe para
// que este limitador continue seguro se alguem o montar numa rota publica, e
// para que requisicao sem IP conhecido nao vire chave vazia, que juntaria todos
// os anonimos num balde so.
export function collectionsRateLimitKey(req) {
  const userId = req?.user?.id;
  if (userId) return `user:${userId}`;
  return `ip:${normalizarIp(req?.ip)}`;
}

// A identidade do balde de IP vem de `req.ip`, que o Express calcula a partir
// do socket e da configuracao `trust proxy` - nunca de um cabecalho lido
// diretamente aqui. Ver `backend/src/app.js` e a nota sobre `trust proxy` em
// `docs/ARCHITECTURE.md`.
export function collectionsIpRateLimitKey(req) {
  return `ip:${normalizarIp(req?.ip)}`;
}

// Nao existe bypass. Nenhuma variavel de ambiente, cabecalho, query string ou
// cookie desliga qualquer um dos dois limitadores: um interruptor desses e uma
// porta, e uma porta que possa ser aberta em producao troca um defeito de teste
// por vulnerabilidade.
//
// A fabrica existe para que os testes exercitem ESTE codigo com numeros
// pequenos, em vez de precisarem de 3001 requisicoes para provar a composicao.
// Os valores de producao continuam travados por teste proprio.
export function criarLimitadoresDeColecoes({
  tetoPorUsuario = TETO_COLECOES_POR_USUARIO,
  tetoPorIp = TETO_COLECOES_POR_IP,
  janelaMs = JANELA_COLECOES_MS,
} = {}) {
  const porUsuario = rateLimit({
    windowMs: janelaMs,
    limit: tetoPorUsuario,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: collectionsRateLimitKey,
  });

  const porIp = rateLimit({
    windowMs: janelaMs,
    limit: tetoPorIp,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: collectionsIpRateLimitKey,
  });

  // Os dois em sequencia: passar exige caber nos DOIS. Qualquer um recusando
  // termina a requisicao em 429 - fail-closed, sem degradar em silencio.
  return [porUsuario, porIp];
}

export const collectionsRateLimit = criarLimitadoresDeColecoes();

// ---------------------------------------------------------------------------
// EXPORTACAO DOS DADOS DO TITULAR (v0.8.0)
// ---------------------------------------------------------------------------
//
// `GET /api/account/export` le a conta inteira de uma vez: alergias, ate 100
// itens de historico e ate 200 favoritos. O volume e pequeno, mas a rota nao
// pode ser barata de repetir - e ela nao serve a nenhum uso continuo do app.
//
// QUANTAS VEZES POR DIA UMA PESSOA EXPORTA OS PROPRIOS DADOS?
//
// O uso legitimo e raro: guardar uma copia, conferir o que o app tem, levar
// para outro servico. Quase sempre uma vez. O que justifica mais de uma e o
// imprevisto: o download que nao terminou, o arquivo salvo no aparelho errado,
// a pessoa que exporta, apaga um favorito e quer ver a diferenca.
//
//   por usuario   5 por 24 horas   a exportacao de verdade e mais quatro
//                                  tentativas de imprevisto. Ninguem precisa de
//                                  uma sexta copia identica no mesmo dia.
//   por IP        20 por 24 horas  quatro pessoas atras do mesmo endereco
//                                  (familia, escritorio, CGNAT de celular)
//                                  esgotando a propria cota no mesmo dia - o
//                                  que ja e improvavel. Contem quem cria contas
//                                  para exportar em serie.
//
// A janela e de 24 horas porque a pergunta e "por dia". Uma janela curta
// recarregaria a cota varias vezes ao dia sem que nada no uso real pedisse isso.
//
// Mesmo desenho dos tetos de colecoes (v0.7.2): usuario E IP, os dois
// conferidos, o mais restritivo vence, usuario primeiro. Sao baldes PROPRIOS -
// exportar nao gasta a cota de historico e favoritos, e vice-versa.
export const TETO_EXPORTACAO_POR_USUARIO = 5;
export const TETO_EXPORTACAO_POR_IP = 20;
export const JANELA_EXPORTACAO_MS = 24 * 60 * 60 * 1000;

// A composicao e a MESMA das colecoes - mesma fabrica, mesmas chaves, mesma
// ordem -, so com outros numeros. Copiar o codigo criaria duas composicoes para
// manter iguais na mao; reaproveitar faz a prova da v0.7.2 valer aqui tambem.
// Cada chamada da fabrica cria baldes novos: exportar nao divide contador com
// historico e favoritos.
export function criarLimitadoresDeExportacao({
  tetoPorUsuario = TETO_EXPORTACAO_POR_USUARIO,
  tetoPorIp = TETO_EXPORTACAO_POR_IP,
  janelaMs = JANELA_EXPORTACAO_MS,
} = {}) {
  return criarLimitadoresDeColecoes({ tetoPorUsuario, tetoPorIp, janelaMs });
}

export const exportRateLimit = criarLimitadoresDeExportacao();
