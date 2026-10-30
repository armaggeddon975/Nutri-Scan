// O QUE O SERVICE WORKER PODE GUARDAR (v0.13.0).
//
// Fonte UNICA da decisao. O service worker (`service-worker.js`) e a limpeza do
// Cache Storage no logout (`limpezaDoCacheStorage.js`) importam daqui, e os
// testes exercitam estas mesmas funcoes - nao uma copia.
//
// O service worker cuida do APP (HTML, JavaScript, CSS, fontes, icones). Os
// DADOS sem rede continuam no IndexedDB da v0.11.0, com a lista fechada dela; os
// dois nao se misturam.
//
// A REGRA CENTRAL: nada de `/api/` passa por aqui. O service worker nem
// intercepta essas requisicoes (`estrategiaPara` devolve IGNORAR, e o navegador
// faz a chamada como faria sem service worker). Perfil, alergias, historico,
// favoritos, exportacao, comparacao, assistente e conta trazem dado de saude e
// o veredito; uma resposta HTTP guardada inteira ficaria no disco fora de
// qualquer controle que o projeto construiu. Sem rede, a chamada falha e o app
// cai no caminho sem rede da v0.11.0, que ja existe.
//
// `podeGuardar` repete a regra na hora de gravar - defesa em camadas: mesmo que
// uma estrategia errada deixasse passar, a gravacao recusa.

export const PREFIXO_DO_CACHE = "nutriscan-shell-";

// A chave do cache inclui a versao do app (a do package.json, posta no service
// worker no build). Versao nova = cache novo; o da versao anterior e apagado
// quando a nova assume (5.4).
export function nomeDoCache(versao) {
  if (!versao) throw new Error("versao do app ausente: o cache nao pode ficar sem versao");
  return `${PREFIXO_DO_CACHE}${versao}`;
}

export const IGNORAR = "ignorar"; // o service worker nao toca: o navegador faz a chamada
export const NAVEGACAO = "navegacao"; // a pagina do app: rede primeiro, o shell guardado sem rede
export const DO_SHELL = "do-shell"; // arquivo do build: cache primeiro

// Prazo da rede para a PAGINA (navegacao). Passado isso, sem resposta, abre o
// shell guardado. O HTML do app tem menos de 1 KB; numa rede que funciona chega
// bem antes. Mais longo, a pessoa sem sinal fica olhando tela em branco.
export const PRAZO_DA_NAVEGACAO_MS = 4000;

function caminhoDe(url) {
  return url.pathname.toLowerCase();
}

export function ehDaApi(url) {
  const caminho = caminhoDe(url);
  return caminho === "/api" || caminho.startsWith("/api/");
}

// `shell` e a lista de caminhos do build ("/", "/index.html", "/assets/...",
// os icones). So o que esta nela pode ser guardado.
export function ehDoShell(url, shell) {
  return shell.includes(url.pathname);
}

/**
 * A estrategia para uma requisicao que chega ao service worker.
 *
 * `requisicao`: { method, url, mode } - `url` e string ou URL.
 * `origem`: a origem do service worker (`self.location.origin`).
 */
export function estrategiaPara(requisicao, { origem, shell }) {
  const url = new URL(requisicao.url);
  // Outra origem (imagem e API da Open Food Facts): o service worker nao toca.
  // Dado de terceiro, nao confiavel, e cada imagem ocupa espaco - nada disso
  // entra no cache do app.
  if (url.origin !== origem) return IGNORAR;
  // So leitura. Escrita sempre vai direto para a rede.
  if ((requisicao.method || "GET").toUpperCase() !== "GET") return IGNORAR;
  // A API inteira: so rede, sem passar pelo service worker. Inclui o
  // /api/health, que diz o estado de AGORA do servidor - guardado, mentiria.
  if (ehDaApi(url)) return IGNORAR;
  if (requisicao.mode === "navigate") return NAVEGACAO;
  if (ehDoShell(url, shell)) return DO_SHELL;
  // Qualquer outra coisa da origem (o proprio sw.js, caminho desconhecido):
  // rede, como sem service worker.
  return IGNORAR;
}

function cabecalho(resposta, nome) {
  return (resposta.headers && resposta.headers.get(nome)) || "";
}

/**
 * Pode esta resposta entrar no Cache Storage? Todas as condicoes, sempre.
 *
 * - leitura (GET), da propria origem, fora de /api/
 * - caminho que esta no shell do build
 * - 200 da propria origem (`basic`; `default` e o que o Node da a uma resposta
 *   construida em teste)
 * - sem Set-Cookie: resposta que mexe em sessao nunca e guardada. No navegador
 *   o service worker nem enxerga Set-Cookie; a regra fica mesmo assim, para
 *   nao depender disso.
 * - sem `Cache-Control: no-store` nem `private`
 */
export function podeGuardar(requisicao, resposta, { origem, shell }) {
  if (!requisicao || !resposta) return false;
  const url = new URL(requisicao.url);
  if (url.origin !== origem) return false;
  if ((requisicao.method || "GET").toUpperCase() !== "GET") return false;
  if (ehDaApi(url)) return false;
  if (!ehDoShell(url, shell)) return false;
  if (resposta.status !== 200) return false;
  if (resposta.type && resposta.type !== "basic" && resposta.type !== "default") return false;
  if (cabecalho(resposta, "set-cookie")) return false;
  if (/no-store|private/i.test(cabecalho(resposta, "cache-control"))) return false;
  return true;
}

// Para a limpeza feita pela PAGINA (logout, exclusao): o que, dentro do cache do
// app, e legitimo continuar ali. A pagina nao conhece a lista exata do build,
// entao a regra e pela FORMA do arquivo do shell - o HTML do app, um arquivo de
// `/assets/` com extensao de codigo, estilo, fonte ou imagem, ou um icone/
// manifesto da raiz -, sem query string, fora de /api/. Tudo o mais - uma
// resposta que nunca deveria ter entrado, um JSON, um resto de outra coisa - sai.
const FORMA_DO_SHELL = /^\/(index\.html|assets\/[^/]+\.(js|css|woff2?|png|jpe?g|svg|webp)|[a-z0-9-]+\.(png|svg|webmanifest|ico))$/i;

export function entradaLegitimaDoShell(urlDaEntrada, { origem }) {
  const url = new URL(urlDaEntrada);
  return url.origin === origem && !ehDaApi(url) && url.search === "" && FORMA_DO_SHELL.test(url.pathname);
}
