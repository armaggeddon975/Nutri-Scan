import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test, { after, before } from "node:test";

import {
  BANCO_QUE_RECUSA,
  ORIGEM_DE_PRODUCAO,
  VARIAVEIS_LIDAS_PELO_BACKEND,
  ambienteDeProducao,
  backendRoot,
  criarDist,
  iniciarServidor,
  portaLivre,
  subirAppDeProducao,
} from "./helpers/producao.js";

// v0.7.5 - endurecimento de producao, SEM deploy.
//
// Configuracao que so vale em producao - cookie, CORS, proxy, vazamento de erro
// - so se manifesta em producao. Estes testes sobem o app de verdade com
// `NODE_ENV=production`, num processo filho isolado do `backend/.env` real, e
// leem o que volta para o cliente.

let app;
let dist;

before(async () => {
  dist = criarDist();
  app = await subirAppDeProducao({ distDir: dist.raiz });
});

after(async () => {
  await app?.encerrar();
  dist?.remover();
});

async function pedir(caminho, opcoes = {}) {
  const resposta = await fetch(`${app.baseUrl}${caminho}`, opcoes);
  return { resposta, texto: await resposta.text() };
}

// Assinaturas do que nunca pode chegar ao cliente numa resposta de erro.
const VAZAMENTOS = [
  ["stack trace", /\n\s*at [^\n]*(\.m?js|node:internal)/],
  ["stack trace", /"stack"/],
  ["detalhe do driver pg", /ECONNREFUSED|connect ECONN|ETIMEDOUT/],
  ["host do banco", /127\.0\.0\.1:1\b/],
  ["usuario do banco", /usuario_falso/],
  ["senha do banco", /senha_falsa/],
  ["nome do banco", /banco_inexistente/],
  ["caminho de arquivo", /[A-Za-z]:\\|\/src\/|node_modules/],
  ["SQL", /\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,80}\b(FROM|INTO|SET|WHERE)\b/i],
  ["nome de tabela", /\b(product_history|product_favorites|sessions|schema_migrations|token_hash)\b/],
];

function vazamentosEm(texto) {
  return VAZAMENTOS.filter(([, regex]) => regex.test(texto)).map(([rotulo]) => rotulo);
}

// ---------------------------------------------------------------------------
// P1 - cookie de sessao em producao
// ---------------------------------------------------------------------------

test("P1 o cookie de sessao em producao e HttpOnly, Secure e SameSite=Lax", async () => {
  // Logout limpa o cookie com os mesmos atributos com que ele e criado - e e a
  // unica rota que emite `Set-Cookie` sem precisar de banco. Os atributos de
  // limpeza PRECISAM bater com os de criacao, senao o navegador nao apaga.
  const { resposta } = await pedir("/api/auth/logout", { method: "POST" });
  assert.equal(resposta.status, 200);

  const cookie = resposta.headers.get("set-cookie") || "";
  assert.match(cookie, /^nutriscan_session=/, `cookie inesperado: ${cookie}`);
  assert.match(cookie, /;\s*HttpOnly/i, "falta HttpOnly: o JavaScript da pagina leria a sessao");
  assert.match(cookie, /;\s*Secure/i, "falta Secure: o cookie trafegaria por http");
  assert.match(cookie, /;\s*SameSite=Lax/i, "SameSite diferente de Lax");
  assert.match(cookie, /;\s*Path=\//i);
});

test("P1 o maxAge do cookie e a expiracao da sessao no banco vem da mesma fonte", () => {
  // Medido num processo em producao: os dois prazos precisam ser o mesmo, senao
  // o navegador guarda um cookie que o banco ja considera expirado, ou o banco
  // aceita uma sessao que o navegador ja apagou.
  const servico = pathToFileURL(path.join(backendRoot, "src/services/authService.js")).href;
  const token = pathToFileURL(path.join(backendRoot, "src/utils/sessionToken.js")).href;
  const config = pathToFileURL(path.join(backendRoot, "src/config/env.js")).href;

  const probe = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
        const { getSessionCookieOptions } = await import(${JSON.stringify(servico)});
        const { getSessionExpiration } = await import(${JSON.stringify(token)});
        const { env } = await import(${JSON.stringify(config)});
        const antes = Date.now();
        const expira = getSessionExpiration(env.sessionTtlDays).getTime();
        console.log(JSON.stringify({
          opcoes: getSessionCookieOptions(),
          ttlDias: env.sessionTtlDays,
          expiraEmMs: expira - antes,
        }));
      `,
    ],
    { cwd: backendRoot, env: ambienteDeProducao({ SESSION_TTL_DAYS: "12" }), encoding: "utf8" },
  );

  assert.equal(probe.status, 0, probe.stderr);
  const { opcoes, ttlDias, expiraEmMs } = JSON.parse(probe.stdout.trim());

  assert.equal(ttlDias, 12);
  assert.equal(opcoes.httpOnly, true);
  assert.equal(opcoes.secure, true, "em producao o cookie precisa ser Secure");
  assert.equal(opcoes.sameSite, "lax");
  assert.equal(opcoes.maxAge, 12 * 24 * 60 * 60 * 1000, "maxAge fora do SESSION_TTL_DAYS");

  // A expiracao no banco e calculada no instante da chamada; tolera o tempo de
  // execucao do proprio probe.
  assert.ok(Math.abs(expiraEmMs - opcoes.maxAge) < 5000, "cookie e banco divergem no prazo");
});

// ---------------------------------------------------------------------------
// P2 e P9 - variavel obrigatoria ausente: o processo NAO SOBE
// ---------------------------------------------------------------------------

test("P2 producao sem FRONTEND_ORIGIN nao sobe, e diz qual falta", async () => {
  const porta = await portaLivre();
  const saida = await iniciarServidor(ambienteDeProducao({ FRONTEND_ORIGIN: "", PORT: String(porta) }));

  assert.equal(saida.subiu, false, "o servidor subiu sem FRONTEND_ORIGIN");
  assert.equal(saida.codigo, 1, `codigo de saida ${saida.codigo}`);
  assert.match(saida.stderr, /FRONTEND_ORIGIN/, `a mensagem nao diz qual falta: ${saida.stderr}`);
  assert.match(saida.stderr, /NAO subiu/);
});

test("P9 cada variavel obrigatoria ausente impede a subida, e a mensagem diz qual", async () => {
  for (const variavel of ["DATABASE_URL", "DATABASE_SSL", "FRONTEND_ORIGIN", "TRUST_PROXY"]) {
    const porta = await portaLivre();
    const saida = await iniciarServidor(ambienteDeProducao({ [variavel]: "", PORT: String(porta) }));

    assert.equal(saida.subiu, false, `o servidor subiu sem ${variavel}`);
    assert.equal(saida.codigo, 1, `sem ${variavel}: codigo de saida ${saida.codigo}`);
    assert.match(saida.stderr, new RegExp(variavel), `sem ${variavel}: mensagem nao cita a variavel`);
  }
});

test("P9 valor booleano nao reconhecido nao cai em default silencioso", async () => {
  for (const variavel of ["DATABASE_SSL", "TRUST_PROXY"]) {
    const porta = await portaLivre();
    const saida = await iniciarServidor(ambienteDeProducao({ [variavel]: "talvez", PORT: String(porta) }));

    assert.equal(saida.subiu, false, `${variavel}=talvez subiu com um default`);
    assert.match(saida.stderr, new RegExp(`${variavel}: valor nao reconhecido`));
  }
});

test("P2 FRONTEND_ORIGIN precisa ser https e so a origem", async () => {
  for (const [valor, trecho] of [
    ["http://app.nutriscan.test", "precisa ser https"],
    ["https://app.nutriscan.test/caminho", "so a origem"],
    ["app.nutriscan.test", "nao e uma URL valida"],
  ]) {
    const porta = await portaLivre();
    const saida = await iniciarServidor(ambienteDeProducao({ FRONTEND_ORIGIN: valor, PORT: String(porta) }));
    assert.equal(saida.subiu, false, `FRONTEND_ORIGIN=${valor} subiu`);
    assert.match(saida.stderr, new RegExp(trecho), `${valor}: ${saida.stderr}`);
  }
});

test("P9 a mensagem de falha cita nomes, nunca valores", async () => {
  const porta = await portaLivre();
  // Banco presente, origem ausente: a mensagem precisa falar da origem SEM
  // imprimir a string de conexao que esta no ambiente.
  const saida = await iniciarServidor(ambienteDeProducao({ FRONTEND_ORIGIN: "", PORT: String(porta) }));

  assert.equal(saida.subiu, false);
  for (const trecho of ["usuario_falso", "senha_falsa", "127.0.0.1:1", "banco_inexistente"]) {
    assert.equal(saida.stderr.includes(trecho), false, `a mensagem de falha imprimiu ${trecho}`);
  }
});

test("P9 com tudo configurado, o servidor sobe", async () => {
  // O par negativo dos testes acima. Sem este, um servidor que nunca subisse
  // passaria em todos eles.
  const porta = await portaLivre();
  const saida = await iniciarServidor(ambienteDeProducao({ PORT: String(porta) }));
  assert.equal(saida.subiu, true, `o servidor completo nao subiu: ${saida.stderr}`);
});

test("P9 fora de producao nenhuma variavel e exigida", async () => {
  const porta = await portaLivre();
  const saida = await iniciarServidor(
    ambienteDeProducao({
      NODE_ENV: "development",
      DATABASE_URL: "",
      DATABASE_SSL: "",
      FRONTEND_ORIGIN: "",
      TRUST_PROXY: "",
      PORT: String(porta),
    }),
  );
  assert.equal(saida.subiu, true, `em desenvolvimento o servidor nao subiu: ${saida.stderr}`);
});

test("P9 o ajudante de teste declara todas as variaveis que o backend le", async () => {
  // Se o backend passar a ler uma variavel nova e ela nao entrar no ajudante,
  // o `backend/.env` real voltaria a preencher o processo de teste.
  const fonte = await readFile(path.join(backendRoot, "src/config/env.js"), "utf8");
  const lidas = new Set([...fonte.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]));
  for (const nome of lidas) {
    assert.ok(VARIAVEIS_LIDAS_PELO_BACKEND.includes(nome), `${nome} nao esta no ajudante`);
  }
});

// ---------------------------------------------------------------------------
// P3 - CORS nao reflete origem arbitraria
// ---------------------------------------------------------------------------

test("P3 CORS devolve a origem configurada, nunca a do request", async () => {
  for (const origem of ["https://atacante.exemplo", "null", "https://app.nutriscan.test.atacante.exemplo"]) {
    const { resposta } = await pedir("/api/health", { headers: { Origin: origem } });
    const permitida = resposta.headers.get("access-control-allow-origin");

    assert.notEqual(permitida, origem, `CORS refletiu ${origem}`);
    assert.notEqual(permitida, "*", "CORS aberto para qualquer origem");
    assert.equal(permitida, ORIGEM_DE_PRODUCAO);
  }
});

test("P2 sem FRONTEND_ORIGIN, nem o createApp direto cai no default de localhost", async () => {
  // Segunda linha de defesa. `server.js` ja recusa subir sem a variavel, mas o
  // app pode ser montado sem passar por ele - e foi o que este proprio teste
  // fez. Em producao, sem origem configurada, NENHUMA origem recebe permissao:
  // nem a de um atacante, nem o `http://localhost:5173` de desenvolvimento.
  const distSemOrigem = criarDist();
  const semOrigem = await subirAppDeProducao({
    distDir: distSemOrigem.raiz,
    ambiente: ambienteDeProducao({ FRONTEND_ORIGIN: "" }),
  });
  try {
    for (const origem of ["http://localhost:5173", "https://atacante.exemplo"]) {
      const resposta = await fetch(`${semOrigem.baseUrl}/api/health`, { headers: { Origin: origem } });
      await resposta.text();
      assert.equal(
        resposta.headers.get("access-control-allow-origin"),
        null,
        `sem FRONTEND_ORIGIN, ${origem} recebeu permissao de CORS`,
      );
    }
  } finally {
    await semOrigem.encerrar();
    distSemOrigem.remover();
  }
});

test("P3 preflight de origem estranha nao recebe permissao com credenciais", async () => {
  const { resposta } = await pedir("/api/history", {
    method: "OPTIONS",
    headers: {
      Origin: "https://atacante.exemplo",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  assert.notEqual(resposta.headers.get("access-control-allow-origin"), "https://atacante.exemplo");
  assert.notEqual(resposta.headers.get("access-control-allow-origin"), "*");
});

// ---------------------------------------------------------------------------
// P4 - trust proxy e o balde de IP
// ---------------------------------------------------------------------------

async function restanteNoLogin(baseUrl, xff) {
  // `POST /api/auth/login` tem limitador por IP. Corpo vazio e recusado pela
  // validacao DEPOIS de o limitador contar, entao isto nao toca o banco.
  const resposta = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(xff ? { "X-Forwarded-For": xff } : {}) },
    body: "{}",
  });
  await resposta.text();
  return Number(resposta.headers.get("ratelimit-remaining"));
}

test("P4 com trust proxy, req.ip segue o X-Forwarded-For e o balde acompanha", async () => {
  const a1 = await restanteNoLogin(app.baseUrl, "203.0.113.10");
  const a2 = await restanteNoLogin(app.baseUrl, "203.0.113.10");
  const b1 = await restanteNoLogin(app.baseUrl, "198.51.100.20");

  assert.ok(Number.isInteger(a1), "o limitador nao devolveu RateLimit-Remaining");
  assert.equal(a2, a1 - 1, "duas requisicoes do mesmo IP nao dividiram o balde");
  assert.equal(b1, a1, "um IP diferente nao ganhou balde proprio: o teto viraria global");

  // O cliente pode prefixar o que quiser; com `trust proxy: 1` vale o ultimo
  // valor, que e o que o proxy acrescenta.
  const forjado = await restanteNoLogin(app.baseUrl, "9.9.9.9, 203.0.113.10");
  assert.equal(forjado, a1 - 2, "prefixar um IP no X-Forwarded-For trocou o balde");
});

test("P4 sem trust proxy, todos caem no mesmo balde - o teto vira global", async () => {
  // E o modo de falha que torna TRUST_PROXY obrigatoria e explicita em
  // producao: atras de proxy, sem confiar nele, todo visitante tem o IP do
  // proxy.
  const distSemProxy = criarDist();
  const semProxy = await subirAppDeProducao({
    distDir: distSemProxy.raiz,
    ambiente: ambienteDeProducao({ TRUST_PROXY: "false" }),
  });
  try {
    const a = await restanteNoLogin(semProxy.baseUrl, "203.0.113.10");
    const b = await restanteNoLogin(semProxy.baseUrl, "198.51.100.20");
    assert.equal(b, a - 1, "sem trust proxy os IPs deveriam colidir");
  } finally {
    await semProxy.encerrar();
    distSemProxy.remover();
  }
});

// ---------------------------------------------------------------------------
// P5 - erro interno em producao nao vaza
// ---------------------------------------------------------------------------

test("P5 erro do driver do banco nao chega ao cliente", async () => {
  // Com um cookie qualquer, `requireAuth` consulta o banco - que recusa a
  // conexao. A mensagem do `pg` cita host e porta. Ela nao pode sair.
  const { resposta, texto } = await pedir("/api/auth/me", {
    headers: { Cookie: "nutriscan_session=token-qualquer" },
  });

  assert.equal(resposta.status, 500);
  assert.deepEqual(vazamentosEm(texto), [], `a resposta vazou: ${texto}`);

  const corpo = JSON.parse(texto);
  assert.equal(corpo.error.code, "INTERNAL_ERROR");
  assert.equal("details" in corpo.error, false, "em producao o erro nao pode ter details");
});

test("P5 JSON quebrado no corpo nao vaza a mensagem do parser", async () => {
  const { resposta, texto } = await pedir("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ isto nao e json",
  });
  assert.ok(resposta.status >= 400);
  assert.deepEqual(vazamentosEm(texto), [], `a resposta vazou: ${texto}`);
  assert.doesNotMatch(texto, /Unexpected token|JSON at position|SyntaxError/);
});

test("P5 o detalhe do erro vai para o log do servidor", async () => {
  // O cliente nao ve; o operador precisa ver. Ate a v0.7.4 o erro era
  // descartado e um 500 em producao sumia sem rastro.
  await pedir("/api/auth/me", { headers: { Cookie: "nutriscan_session=outro-token" } });
  await new Promise((r) => setTimeout(r, 200));
  assert.match(app.lerStderr(), /\[erro interno\]/, "o erro interno nao foi registrado no log");
});

// ---------------------------------------------------------------------------
// P6 e P7 - estaticos em producao
// ---------------------------------------------------------------------------

test("P6 rota /api inexistente da 404 de API, nunca o index.html", async () => {
  for (const caminho of ["/api/naoexiste", "/API/naoexiste", "/api", "/api/history/../naoexiste"]) {
    const { resposta, texto } = await pedir(caminho);
    assert.equal(resposta.status, 404, `${caminho} -> ${resposta.status}`);
    assert.match(resposta.headers.get("content-type") || "", /application\/json/, caminho);
    assert.doesNotMatch(texto, /<!doctype html/i, `${caminho} devolveu o app`);
  }
});

test("P7 rota do frontend recebe o app (fallback de SPA)", async () => {
  for (const caminho of ["/", "/alergias", "/meus", "/conta/qualquer"]) {
    const { resposta, texto } = await pedir(caminho);
    assert.equal(resposta.status, 200, caminho);
    assert.match(resposta.headers.get("content-type") || "", /text\/html/, caminho);
    assert.match(texto, /NutriScan/, caminho);
  }
});

// ---------------------------------------------------------------------------
// P8 - health
// ---------------------------------------------------------------------------

test("P8 o health expoe versao e nada que ajude um atacante", async () => {
  const { resposta, texto } = await pedir("/api/health");
  assert.equal(resposta.status, 200);

  const corpo = JSON.parse(texto);
  const pacote = JSON.parse(await readFile(path.join(backendRoot, "package.json"), "utf8"));

  assert.equal(corpo.version, pacote.version, "versao do health fora do backend/package.json");
  assert.deepEqual(Object.keys(corpo).sort(), ["ai", "database", "status", "version"]);

  // O banco aqui recusa conexao: o health diz `error`, e so isso.
  assert.equal(corpo.database, "error");
  assert.deepEqual(vazamentosEm(texto), []);
  for (const proibido of [...VARIAVEIS_LIDAS_PELO_BACKEND, "anthropic", BANCO_QUE_RECUSA]) {
    assert.equal(texto.includes(proibido), false, `o health expoe ${proibido}`);
  }
});

test("P8 a versao do health tem fonte unica, sem literal duplicado", async () => {
  const fonte = await readFile(path.join(backendRoot, "src/config/env.js"), "utf8");
  const codigo = fonte
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");

  assert.doesNotMatch(codigo, /APP_VERSION\s*=\s*["'`]\d+\.\d+\.\d+/, "a versao voltou a ser literal");
  assert.match(codigo, /package\.json/, "a versao nao vem do package.json");
});

// ---------------------------------------------------------------------------
// 6.5 - HTTPS delegado ao Render, HSTS no backend
// ---------------------------------------------------------------------------

test("6.5 HSTS sai do backend em producao, e o health nao redireciona", async () => {
  const { resposta } = await pedir("/api/health", { redirect: "manual" });

  // Sem redirecionamento no backend: o health check da hospedagem bate na porta
  // interna por http, e um redirect para https o derrubaria.
  assert.equal(resposta.status, 200, "o health redirecionou - quebraria o health check");

  const hsts = resposta.headers.get("strict-transport-security") || "";
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] || 0);
  assert.ok(maxAge >= 15552000, `HSTS fraco ou ausente: ${hsts}`);
});
