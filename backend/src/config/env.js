import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../..");

dotenv.config({
  path: path.join(backendRoot, ".env"),
  override: false,
  quiet: true,
});

// VERSAO DE FONTE UNICA (v0.7.5, item 6.7)
//
// Ate a v0.7.4 a versao era um literal aqui, repetido em `package.json`, em
// `backend/package.json` e nos dois lockfiles. Um teste conferia que as copias
// batiam, mas a duplicacao existia - e foi exatamente uma divergencia desse tipo
// que produziu o achado R3 da v0.6.9: commits publicados sob o numero 0.6.8, com
// `/api/health` anunciando uma versao que nao correspondia ao que rodava.
//
// Agora o health le de `backend/package.json`, que e o manifesto do proprio
// processo que esta respondendo. O arquivo vai junto no deploy - o Render
// publica o repositorio e roda `npm --prefix backend ci` - entao nao ha caminho
// em que o processo suba sem ele.
const APP_VERSION = JSON.parse(readFileSync(path.join(backendRoot, "package.json"), "utf8")).version;
const AI_PROVIDER = "anthropic";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const VALID_NODE_ENVS = new Set(["development", "test", "production"]);

function parsePort(value, fallback = 3000) {
  const port = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fallback;
  return port;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  return fallback;
}

function parseNodeEnv(value) {
  const normalized = String(value || "development").trim().toLowerCase();
  return VALID_NODE_ENVS.has(normalized) ? normalized : "development";
}

const NODE_ENV = parseNodeEnv(process.env.NODE_ENV);

// `http://localhost:5173` e o Vite em desenvolvimento. Em producao esse default
// era uma configuracao errada SILENCIOSA: o backend anunciava em CORS, com
// `credentials: true`, que confiava numa origem local qualquer. Em producao nao
// ha default - a variavel e obrigatoria e a falta dela impede o processo de
// subir (`verificarAmbienteDeProducao`, abaixo).
const DEFAULT_FRONTEND_ORIGIN_DEV = "http://localhost:5173";

export const env = {
  version: APP_VERSION,
  nodeEnv: NODE_ENV,
  port: parsePort(process.env.PORT),
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  frontendOrigin:
    process.env.FRONTEND_ORIGIN || (NODE_ENV === "production" ? "" : DEFAULT_FRONTEND_ORIGIN_DEV),
  // Atras de proxy (Render, Fly, Nginx) o Express precisa confiar no
  // X-Forwarded-For para o rate limit contar por visitante, nao por proxy.
  trustProxy: parseBoolean(process.env.TRUST_PROXY, parseNodeEnv(process.env.NODE_ENV) === "production"),
  sessionTtlDays: parsePositiveInt(process.env.SESSION_TTL_DAYS, 30),
  // O cookie de sessao ja esta no navegador de quem esta logado em producao, e
  // trocar o nome desloga todo mundo de uma vez. Por isso ele atravessou as
  // trocas de nome do produto sem mudar. Da para ajustar por SESSION_COOKIE_NAME
  // quando houver uma janela para deslogar todo mundo.
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "nutriscan_session",
  aiProvider: AI_PROVIDER,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
  anthropicTimeoutMs: parsePositiveInt(process.env.ANTHROPIC_TIMEOUT_MS, 20000),
  anthropicMaxOutputTokens: parsePositiveInt(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS, 1200),
  backendRoot,
};

export function isProduction() {
  return env.nodeEnv === "production";
}

// ---------------------------------------------------------------------------
// VARIAVEIS OBRIGATORIAS EM PRODUCAO (v0.7.5, itens 6.2 e 6.9)
// ---------------------------------------------------------------------------
//
// Em producao, nenhuma variavel obrigatoria pode cair num default silencioso.
// Faltando uma, o processo NAO SOBE - `server.js` chama esta funcao antes de
// abrir a porta. Fail-closed: um servico que nao sobe aparece no painel e no
// health check; um servico que sobe mal configurado so aparece quando alguem se
// machuca.
//
// Por que cada uma esta aqui:
//
//   DATABASE_URL     sem banco, conta, perfil, historico e favoritos respondem
//                    503. O app "funciona", mas nada persiste.
//   DATABASE_SSL     o default local e `false`. Em producao, um default `false`
//                    contra um banco remoto manda a conexao - e a senha - sem
//                    TLS se o servidor aceitar. Precisa ser decisao explicita.
//   FRONTEND_ORIGIN  sem ela, o backend caia em `http://localhost:5173` e
//                    anunciava em CORS, com credenciais, uma origem local.
//   TRUST_PROXY      o valor certo depende de haver proxy na frente. Errado
//                    para um lado, todos os visitantes compartilham o IP do
//                    proxy e o teto de 3000 por IP vira teto GLOBAL; errado para
//                    o outro, o cliente escolhe o proprio IP mandando
//                    `X-Forwarded-For` e foge do teto. Os dois erros sao
//                    silenciosos, entao a escolha precisa ser explicita.
//
// ANTHROPIC_API_KEY NAO e obrigatoria, por decisao de produto documentada no
// `render.yaml`: sem chave o assistente cai na resposta local e o health diz
// `ai: not_configured`. A falta e visivel, nao silenciosa.
//
// As mensagens dizem QUAL variavel falta e por que, e nunca o valor de nenhuma.
export const VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "FRONTEND_ORIGIN",
  "TRUST_PROXY",
];

function presente(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

function booleanoReconhecido(valor) {
  const normalizado = String(valor).trim().toLowerCase();
  return ["true", "1", "yes", "sim", "false", "0", "no", "nao", "não"].includes(normalizado);
}

export function verificarAmbienteDeProducao(fonte = process.env) {
  const problemas = [];

  for (const variavel of VARIAVEIS_OBRIGATORIAS_EM_PRODUCAO) {
    if (!presente(fonte[variavel])) {
      problemas.push({ variavel, motivo: "ausente ou vazia" });
    }
  }

  // Presente nao basta para booleano: `TRUST_PROXY=talvez` cairia no default
  // em silencio, que e exatamente o que esta funcao existe para impedir.
  for (const variavel of ["DATABASE_SSL", "TRUST_PROXY"]) {
    if (presente(fonte[variavel]) && !booleanoReconhecido(fonte[variavel])) {
      problemas.push({ variavel, motivo: "valor nao reconhecido como true/false" });
    }
  }

  if (presente(fonte.FRONTEND_ORIGIN)) {
    let url = null;
    try {
      url = new URL(fonte.FRONTEND_ORIGIN.trim());
    } catch {
      problemas.push({ variavel: "FRONTEND_ORIGIN", motivo: "nao e uma URL valida" });
    }
    if (url) {
      // Em producao o cookie de sessao e `secure`: uma origem `http://` nunca
      // receberia o cookie, e o login quebraria de um jeito dificil de achar.
      if (url.protocol !== "https:") {
        problemas.push({ variavel: "FRONTEND_ORIGIN", motivo: "precisa ser https:// em producao" });
      }
      // Origem e esquema + host + porta. Caminho ou query aqui nunca casaria
      // com o cabecalho `Origin` que o navegador envia.
      if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
        problemas.push({
          variavel: "FRONTEND_ORIGIN",
          motivo: "deve ser so a origem, sem caminho, query ou fragmento",
        });
      }
    }
  }

  return problemas;
}

export function descreverProblemasDeAmbiente(problemas) {
  return [
    "NutriScan NAO subiu: configuracao de producao incompleta.",
    ...problemas.map(({ variavel, motivo }) => `  - ${variavel}: ${motivo}`),
    "Defina as variaveis no painel da hospedagem. Nenhum valor e impresso aqui.",
  ].join("\n");
}
