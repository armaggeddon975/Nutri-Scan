import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import express from "express";

import {
  JANELA_COLECOES_MS,
  TETO_COLECOES_POR_IP,
  TETO_COLECOES_POR_USUARIO,
  collectionsIpRateLimitKey,
  collectionsRateLimit,
  collectionsRateLimitKey,
  criarLimitadoresDeColecoes,
  normalizarIp,
} from "../src/middleware/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const origemDoLimitador = path.join(rootDir, "backend/src/middleware/rateLimit.js");

// D1 (auditoria da v0.7.0) e E1 (auditoria da v0.7.1).
//
// D1: o limitador contava so por IP, a suite de integracao gastava 372
// requisicoes do mesmo endereco e estourava o teto de 300 no oitavo teste.
// Nove testes falhavam, entre eles os de isolamento entre contas.
//
// E1: a correcao de D1 trocou a chave para o usuario e ELIMINOU o teto por IP,
// porque `requireAuth` roda antes e o ramo de IP nunca executava. O auditor
// mediu 4 contas do mesmo endereco passando 1200 requisicoes.
//
// Agora os dois tetos coexistem. Estes testes existem para que nenhum dos dois
// possa ser removido em silencio.
//
// POR QUE A MAIORIA DOS TESTES USA NUMEROS PEQUENOS
//
// Provar o teto de producao por comportamento custa 3001 requisicoes, o que
// levaria mais de meio minuto por teste e ainda consumiria o balde
// compartilhado dos outros. Os testes de composicao usam a MESMA fabrica que
// constroi o limitador de producao, com tetos pequenos. Os valores de producao
// sao travados a parte, em R6 e R7, e o teto por usuario tambem e exercitado no
// seu valor real em Q2.

const PRODUTO = { usarProducao: true };

async function comServidor(callback, opcoes = {}) {
  const {
    tetoPorUsuario,
    tetoPorIp,
    usuarioFixo = null,
    confiarProxy = false,
    usarProducao = false,
  } = opcoes;

  const app = express();
  if (confiarProxy) app.set("trust proxy", 1);

  // Simula o `requireAuth`, que roda ANTES do limitador nas rotas reais: e dele
  // que vem `req.user`. Com `usuarioFixo` a sessao e sempre a mesma pessoa,
  // independentemente do que a requisicao carrega - e assim que se testa se o
  // limitador olha para a sessao ou para algo que o cliente controla.
  app.use((req, _res, next) => {
    if (usuarioFixo) {
      req.user = { id: usuarioFixo };
    } else {
      const id = req.get("x-teste-usuario");
      if (id) req.user = { id };
    }
    next();
  });

  app.use(usarProducao ? collectionsRateLimit : criarLimitadoresDeColecoes({ tetoPorUsuario, tetoPorIp }));
  app.get("/", (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function bater(baseUrl, vezes, { usuario, ip, headers = {}, caminho = "/" } = {}) {
  const codigos = [];
  for (let i = 0; i < vezes; i += 1) {
    const codigo = await baterUmaVez(baseUrl, { usuario, ip, headers, caminho });
    codigos.push(codigo);
  }
  return codigos;
}

async function baterUmaVez(baseUrl, { usuario, ip, headers = {}, caminho = "/" } = {}) {
  const resposta = await fetch(new URL(caminho, baseUrl), {
    headers: {
      ...(usuario ? { "x-teste-usuario": usuario } : {}),
      ...(ip ? { "x-forwarded-for": ip } : {}),
      ...headers,
    },
  });
  return resposta.status;
}

function contarOk(codigos) {
  return codigos.filter((codigo) => codigo === 200).length;
}

// Os comentarios deste modulo descrevem justamente o que nao pode existir no
// codigo - "nenhuma variavel de ambiente", "nenhum cabecalho". Casar a
// expressao contra eles acusaria um defeito que nao esta la.
function semComentarios(fonte) {
  return fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// R1 - usuario dentro do teto, IP estourado -> 429
// ---------------------------------------------------------------------------

test("R1 usuario dentro do teto mas IP estourado recebe 429", { timeout: 60000 }, async () => {
  await comServidor(
    async (baseUrl) => {
      const codigos = await bater(baseUrl, 10, { ip: "203.0.113.1" });
      assert.equal(contarOk(codigos), 10, "as 10 primeiras deveriam passar");

      const seguinte = await baterUmaVez(baseUrl, { ip: "203.0.113.1" });
      assert.equal(seguinte, 429, "o teto por IP deveria ter recusado a 11a");
    },
    // O usuario tem 100 de cota e gastou 11. Quem recusa e o IP.
    { tetoPorUsuario: 100, tetoPorIp: 10, usuarioFixo: "usuario-folgado", confiarProxy: true },
  );
});

// ---------------------------------------------------------------------------
// R2 - IP dentro do teto, usuario estourado -> 429
// ---------------------------------------------------------------------------

test("R2 IP dentro do teto mas usuario estourado recebe 429", { timeout: 60000 }, async () => {
  await comServidor(
    async (baseUrl) => {
      const codigos = await bater(baseUrl, 5, { ip: "203.0.113.2" });
      assert.equal(contarOk(codigos), 5, "as 5 primeiras deveriam passar");

      const seguinte = await baterUmaVez(baseUrl, { ip: "203.0.113.2" });
      assert.equal(seguinte, 429, "o teto por usuario deveria ter recusado a 6a");
    },
    // O IP tem 1000 de cota e gastou 5. Quem recusa e o usuario.
    { tetoPorUsuario: 5, tetoPorIp: 1000, usuarioFixo: "usuario-apertado", confiarProxy: true },
  );
});

// ---------------------------------------------------------------------------
// R3 - REGRESSAO DE E1
// ---------------------------------------------------------------------------

test(
  "R3 multiplas contas do mesmo IP nao ultrapassam o teto por IP",
  { timeout: 120000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const IP = "203.0.113.3";
        const TETO_USUARIO = 5;
        const TETO_IP = 20;
        const CONTAS = 10;

        let aceitas = 0;
        const porConta = [];

        for (let i = 0; i < CONTAS; i += 1) {
          const codigos = await bater(baseUrl, TETO_USUARIO + 2, {
            usuario: `conta-${i}`,
            ip: IP,
          });
          const ok = contarOk(codigos);
          aceitas += ok;
          porConta.push(ok);
        }

        // Sem teto por IP - que era o estado da v0.7.1 - isto daria
        // 10 contas x 5 = 50. Foi exatamente assim que o auditor mediu 1200
        // requisicoes com 4 contas contra o teto de 300 por usuario.
        assert.equal(
          aceitas,
          TETO_IP,
          `${CONTAS} contas do mesmo IP passaram ${aceitas} requisicoes; o teto por IP e ${TETO_IP}. ` +
            `Por conta: ${porConta.join(", ")}`,
        );
      },
      { tetoPorUsuario: 5, tetoPorIp: 20, confiarProxy: true },
    );
  },
);

// ---------------------------------------------------------------------------
// R4 - o ganho NAT/CGNAT da v0.7.1 nao regride
// ---------------------------------------------------------------------------

test(
  "R4 usuarios de IPs distintos nao consomem cota um do outro",
  { timeout: 60000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const primeiro = await bater(baseUrl, 6, { usuario: "usuario-a", ip: "203.0.113.10" });
        assert.equal(contarOk(primeiro), 5, "o primeiro deveria gastar a cota inteira");
        assert.equal(primeiro[5], 429, "o primeiro deveria ter estourado");

        const segundo = await bater(baseUrl, 5, { usuario: "usuario-b", ip: "198.51.100.20" });
        assert.deepEqual(
          segundo,
          [200, 200, 200, 200, 200],
          "o segundo, de outro IP, foi punido pelo primeiro",
        );
      },
      { tetoPorUsuario: 5, tetoPorIp: 5, confiarProxy: true },
    );
  },
);

test(
  "R4 dois usuarios atras do MESMO IP mantem cotas separadas ate o teto do IP",
  { timeout: 60000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const IP = "203.0.113.11";

        // Este e o caso NAT/CGNAT: as duas pessoas compartilham o endereco e
        // nenhuma pode derrubar a outra enquanto houver orcamento de IP.
        const primeiro = await bater(baseUrl, 6, { usuario: "vizinho-a", ip: IP });
        assert.equal(contarOk(primeiro), 5, "o primeiro deveria gastar a propria cota");

        const segundo = await bater(baseUrl, 5, { usuario: "vizinho-b", ip: IP });
        assert.deepEqual(
          segundo,
          [200, 200, 200, 200, 200],
          "o vizinho de NAT foi punido pela cota do outro - o ganho da v0.7.1 regrediu",
        );
      },
      { tetoPorUsuario: 5, tetoPorIp: 100, confiarProxy: true },
    );
  },
);

test(
  "R4 a requisicao recusada pelo teto de usuario nao consome orcamento do IP",
  { timeout: 60000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const IP = "203.0.113.12";

        // O abusivo bate MUITO alem da propria cota. Se as recusas contassem no
        // balde de IP, ele esgotaria o orcamento dos vizinhos de NAT sem nunca
        // ser atendido. E por isso que o teto por usuario e conferido primeiro.
        await bater(baseUrl, 40, { usuario: "abusivo", ip: IP });

        const vizinho = await bater(baseUrl, 5, { usuario: "vizinho", ip: IP });
        assert.deepEqual(
          vizinho,
          [200, 200, 200, 200, 200],
          "as recusas do abusivo consumiram o orcamento de IP dos vizinhos",
        );
      },
      { tetoPorUsuario: 5, tetoPorIp: 20, confiarProxy: true },
    );
  },
);

// ---------------------------------------------------------------------------
// R5 - nenhum dado do request escolhe, troca ou cria balde
// ---------------------------------------------------------------------------

// Cada um dos dois baldes precisa ser testado com o OUTRO teto folgado.
//
// A primeira versao deste teste punha os dois tetos em 10. O teto por usuario e
// conferido primeiro, entao era sempre ele quem recusava, e o balde de IP ficava
// escondido atras dele: a validacao por mutacao trocou a chave de IP por um
// cabecalho do request e este teste continuou verde. O defeito foi pego apenas
// pela leitura do codigo-fonte, que e a rede mais fraca.
//
// Com o outro teto folgado, sabe-se exatamente qual limitador produziu o 429, e
// forjar dados passa a ser observavel.

const FORJAS_DE_USUARIO = [
  { rotulo: "cabecalho de usuario", headers: { "x-usuario": "outro" } },
  { rotulo: "cabecalho de id", headers: { "x-user-id": "outro" } },
  { rotulo: "cabecalho de autor", headers: { "x-teste-usuario": "outro" } },
  { rotulo: "cookie", headers: { cookie: "user=outro; bypass=1" } },
  { rotulo: "desligamento por cabecalho", headers: { "x-rate-limit": "off" } },
  { rotulo: "query de usuario", caminho: "/?user=outro&userId=outro" },
  { rotulo: "query de desligamento", caminho: "/?rateLimit=off&bypass=1" },
];

const FORJAS_DE_IP = [
  { rotulo: "X-Forwarded-For", headers: { "x-forwarded-for": "203.0.113.99" } },
  { rotulo: "X-Real-IP", headers: { "x-real-ip": "203.0.113.99" } },
  { rotulo: "X-Client-IP", headers: { "x-client-ip": "203.0.113.99" } },
  { rotulo: "True-Client-IP", headers: { "true-client-ip": "203.0.113.99" } },
  { rotulo: "CF-Connecting-IP", headers: { "cf-connecting-ip": "203.0.113.99" } },
  { rotulo: "Forwarded", headers: { forwarded: "for=203.0.113.99" } },
  { rotulo: "X-Originating-IP", headers: { "x-originating-ip": "203.0.113.99" } },
  { rotulo: "query de IP", caminho: "/?ip=203.0.113.99" },
];

test(
  "R5 dados forjados no request nao conseguem balde de USUARIO novo",
  { timeout: 120000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const codigos = await bater(baseUrl, 11);
        assert.equal(codigos[10], 429, "a cota de usuario deveria ter esgotado");

        for (const tentativa of [...FORJAS_DE_USUARIO, ...FORJAS_DE_IP]) {
          const codigo = await baterUmaVez(baseUrl, tentativa);
          assert.equal(
            codigo,
            429,
            `${tentativa.rotulo} conseguiu um balde de usuario novo (veio ${codigo})`,
          );
        }
      },
      // Teto de IP folgado: quem recusa aqui e sempre o teto por usuario.
      { tetoPorUsuario: 10, tetoPorIp: 10000, usuarioFixo: "usuario-unico", confiarProxy: false },
    );
  },
);

test(
  "R5 dados forjados no request nao conseguem balde de IP novo",
  { timeout: 120000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        const codigos = await bater(baseUrl, 11);
        assert.equal(codigos[10], 429, "a cota de IP deveria ter esgotado");

        // Sem `trust proxy`, `req.ip` vem do socket e NENHUM destes cabecalhos
        // pode participar da chave.
        for (const tentativa of FORJAS_DE_IP) {
          const codigo = await baterUmaVez(baseUrl, tentativa);
          assert.equal(
            codigo,
            429,
            `${tentativa.rotulo} conseguiu um balde de IP novo (veio ${codigo})`,
          );
        }
      },
      // Teto de usuario folgado: quem recusa aqui e sempre o teto por IP.
      { tetoPorUsuario: 10000, tetoPorIp: 10, usuarioFixo: "usuario-folgado", confiarProxy: false },
    );
  },
);

test(
  "R5 com trust proxy o cliente nao escolhe o proprio IP",
  { timeout: 120000 },
  async () => {
    await comServidor(
      async (baseUrl) => {
        // Producao roda atras do proxy do Render, que ACRESCENTA o IP real do
        // cliente ao fim de `X-Forwarded-For`. Com `trust proxy: 1` o Express
        // le sempre esse ultimo valor. O cliente pode prefixar o que quiser na
        // frente; nada disso vira `req.ip`.
        const codigos = await bater(baseUrl, 11, { ip: "203.0.113.50" });
        assert.equal(codigos[10], 429, "o balde do IP real deveria ter esgotado");

        const forjas = [
          "1.2.3.4, 203.0.113.50",
          "9.9.9.9, 8.8.8.8, 203.0.113.50",
          "2001:db8::1, 203.0.113.50",
        ];

        for (const forja of forjas) {
          const codigo = await baterUmaVez(baseUrl, { headers: { "x-forwarded-for": forja } });
          assert.equal(
            codigo,
            429,
            `prefixar "${forja}" mudou o balde de IP; o cliente escolheu a propria identidade`,
          );
        }
      },
      { tetoPorUsuario: 1000, tetoPorIp: 10, usuarioFixo: "usuario-folgado", confiarProxy: true },
    );
  },
);

test("R5 a chave de usuario vem da sessao, e a de IP vem de req.ip", () => {
  assert.equal(collectionsRateLimitKey({ user: { id: "u1" }, ip: "10.0.0.1" }), "user:u1");
  assert.equal(collectionsRateLimitKey({ user: { id: "u2" }, ip: "10.0.0.1" }), "user:u2");
  assert.equal(collectionsRateLimitKey({ ip: "10.0.0.1" }), "ip:10.0.0.1");
  assert.equal(collectionsRateLimitKey({ user: null, ip: "10.0.0.2" }), "ip:10.0.0.2");

  // O balde de IP ignora a sessao: e outro teto, com outra finalidade.
  assert.equal(collectionsIpRateLimitKey({ user: { id: "u1" }, ip: "10.0.0.1" }), "ip:10.0.0.1");
  assert.equal(collectionsIpRateLimitKey({ ip: "10.0.0.2" }), "ip:10.0.0.2");

  // Requisicao sem IP conhecido nao pode virar chave vazia, que juntaria todo
  // mundo no mesmo balde.
  assert.equal(collectionsIpRateLimitKey({}), "ip:desconhecido");
});

test("R5 um bloco IPv6 /64 nao vira infinitos baldes", () => {
  // Quem recebe um /64 da operadora tem 2^64 enderecos. Sem normalizar, trocar
  // de endereco a cada requisicao daria um balde novo toda vez e o teto por IP
  // viraria enfeite.
  const mesmoBloco = [
    "2001:db8:1234:5678:0000:0000:0000:0001",
    "2001:db8:1234:5678:aaaa:bbbb:cccc:dddd",
    "2001:db8:1234:5678::9999",
  ].map((ip) => collectionsIpRateLimitKey({ ip }));

  assert.equal(new Set(mesmoBloco).size, 1, `enderecos do mesmo /64 geraram baldes diferentes: ${mesmoBloco}`);

  // Blocos diferentes continuam separados: normalizar nao pode juntar clientes
  // que nao tem relacao.
  assert.notEqual(
    collectionsIpRateLimitKey({ ip: "2001:db8:1234:5678::1" }),
    collectionsIpRateLimitKey({ ip: "2001:db8:1234:9999::1" }),
  );

  // IPv4 e IPv4 mapeado sao a mesma pessoa e precisam cair no mesmo balde.
  assert.equal(normalizarIp("::ffff:203.0.113.9"), normalizarIp("203.0.113.9"));
});

// ---------------------------------------------------------------------------
// R6 e R7 - os valores de producao
// ---------------------------------------------------------------------------

test("R6 os tres tetos por rota seguem nos valores declarados", async () => {
  const fonte = await readFile(origemDoLimitador, "utf8");

  for (const [nome, janela, teto] of [
    ["authRateLimit", "15 * 60 * 1000", "40"],
    ["assistantRateLimit", "10 * 60 * 1000", "20"],
  ]) {
    const inicio = fonte.indexOf(`export const ${nome} = rateLimit({`);
    assert.ok(inicio !== -1, `limitador ${nome} sumiu`);
    const bloco = fonte.slice(inicio, fonte.indexOf("});", inicio));
    assert.ok(bloco.includes(`windowMs: ${janela}`), `${nome} mudou de janela`);
    assert.ok(bloco.includes(`limit: ${teto}`), `${nome} mudou de teto`);
  }

  assert.equal(TETO_COLECOES_POR_USUARIO, 300, "o teto de colecoes por usuario mudou");
  assert.equal(JANELA_COLECOES_MS, 10 * 60 * 1000, "a janela de colecoes mudou");
});

test("R7 o teto por IP esta no valor medido, e ele cobre as suites com folga", () => {
  // Numeros medidos na v0.7.2, nao estimados:
  const GASTO_DA_SUITE_DE_INTEGRACAO = 403;
  const GASTO_DO_GATE_E2E = 9;
  const FOLGA_MINIMA = 4;

  assert.equal(TETO_COLECOES_POR_IP, 3000, "o teto por IP mudou sem atualizar a medicao");

  const maiorGasto = Math.max(GASTO_DA_SUITE_DE_INTEGRACAO, GASTO_DO_GATE_E2E);
  const folga = TETO_COLECOES_POR_IP / maiorGasto;

  assert.ok(
    folga >= FOLGA_MINIMA,
    `folga de apenas ${folga.toFixed(2)}x sobre ${maiorGasto} requisicoes. ` +
      `Teto por IP baixo demais traz D1 de volta: a suite de integracao volta a falhar por quota.`,
  );

  // O teto por IP e rede de contencao, nao o controle primario. Perto do teto
  // por usuario, ele puniria o caso NAT/CGNAT que a v0.7.1 corrigiu.
  assert.ok(
    TETO_COLECOES_POR_IP >= TETO_COLECOES_POR_USUARIO * 5,
    "o teto por IP precisa ser consideravelmente maior que o teto por usuario",
  );
});

// ---------------------------------------------------------------------------
// Q2 (mantido da v0.7.1) - o teto por usuario de PRODUCAO recusa em limite+1
// ---------------------------------------------------------------------------

// O 300 abaixo e escrito por extenso de proposito, e NAO lido de
// `TETO_COLECOES_POR_USUARIO`.
//
// Um teste que deriva a expectativa da mesma constante que deveria vigiar nao
// vigia nada: se alguem inflar a constante, o teste infla junto e continua
// verde. A validacao por mutacao pegou exatamente isso - a versao anterior
// deste teste montava o laco com `TETO_COLECOES_POR_USUARIO + 1` e, com a
// constante mutada para 100000, saiu fazendo 100001 requisicoes em vez de
// falhar.
//
// R6 e quem confere que a constante vale 300. Aqui o valor e afirmado a mao,
// para que os dois precisem concordar.
const TETO_DE_PRODUCAO_POR_USUARIO = 300;

test(
  "Q2 em producao o teto por usuario recusa na requisicao seguinte ao teto",
  { timeout: 180000 },
  async () => {
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await comServidor(
        async (baseUrl) => {
          const codigos = await bater(baseUrl, TETO_DE_PRODUCAO_POR_USUARIO + 1);
          assert.equal(
            contarOk(codigos),
            TETO_DE_PRODUCAO_POR_USUARIO,
            `esperado ${TETO_DE_PRODUCAO_POR_USUARIO} permitidas, veio ${contarOk(codigos)}`,
          );
          assert.equal(
            codigos[TETO_DE_PRODUCAO_POR_USUARIO],
            429,
            "a requisicao seguinte ao teto deveria ser recusada",
          );
        },
        { ...PRODUTO, usuarioFixo: "usuario-do-teto-real" },
      );
    } finally {
      process.env.NODE_ENV = anterior;
    }
  },
);

// ---------------------------------------------------------------------------
// Q3 e Q4 (mantidos da v0.7.1) - nao existe bypass
// ---------------------------------------------------------------------------

test("Q4 nenhum dos limitadores tem opcao de pular requisicao", async () => {
  const codigo = semComentarios(await readFile(origemDoLimitador, "utf8"));

  assert.doesNotMatch(codigo, /\bskip\s*:/, "o limitador ganhou uma opcao de skip");
  assert.doesNotMatch(codigo, /skipSuccessfulRequests|skipFailedRequests/);

  // A interrogacao cobre `req.get` e `req?.get?.(`, que sao a mesma leitura
  // escrita de duas formas. A validacao por mutacao da v0.7.1 mostrou que a
  // versao sem ela deixava o defeito passar.
  assert.doesNotMatch(codigo, /req\??\.(get|header|headers)\b/, "o limitador le cabecalho");
  assert.doesNotMatch(codigo, /req\??\.query\b/, "o limitador le query string");
  assert.doesNotMatch(codigo, /req\??\.cookies\b/, "o limitador le cookie");
});

test("Q3 nenhuma variavel de ambiente desliga os limitadores", async () => {
  const codigo = semComentarios(await readFile(origemDoLimitador, "utf8"));

  assert.doesNotMatch(
    codigo,
    /process\.env/,
    "o limitador passou a depender de variavel de ambiente: se ela puder ser " +
      "definida em producao, o defeito de teste virou vulnerabilidade",
  );
});

test("Q3 os dois limitadores estao montados em todas as rotas de colecoes", async () => {
  for (const arquivo of ["historyRoutes.js", "favoritesRoutes.js"]) {
    const fonte = await readFile(path.join(rootDir, "backend/src/routes", arquivo), "utf8");
    assert.match(
      fonte,
      /\.use\(requireAuth,\s*collectionsRateLimit\)/,
      `${arquivo} nao aplica os limitadores a todas as rotas`,
    );
  }

  // `collectionsRateLimit` precisa continuar sendo os DOIS. Se virar um so,
  // a montagem acima continuaria casando e o teto perdido passaria despercebido.
  assert.ok(Array.isArray(collectionsRateLimit), "collectionsRateLimit deixou de ser composto");
  assert.equal(collectionsRateLimit.length, 2, "um dos dois tetos sumiu da composicao");
});
