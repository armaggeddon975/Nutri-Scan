// Ambiente para rodar o service worker DE VERDADE no Node (v0.13.0).
//
// O que e real aqui: o codigo do service worker - o `sw.js` que o build gera,
// ou o que `montarServiceWorker` monta, com a politica de `src/sw/` dentro -, e
// os objetos `Request`, `Response` e `Headers` do proprio Node, que seguem a
// especificacao Fetch. O service worker roda num contexto `vm` com o mesmo
// conjunto de globais que o navegador da a ele, e recebe os mesmos eventos:
// install, activate, fetch, message.
//
// O que e duble: o Cache Storage e a rede.
//   - O Cache Storage em memoria SO GUARDA. Ele nao decide nada: o que entra, o
//     que sai e quando e decidido pelo codigo do service worker - o mesmo que
//     vai para o navegador. Ele guarda o corpo inteiro de cada resposta, para o
//     teste poder procurar dado de usuario DENTRO dos corpos.
//   - A rede devolve os arquivos de um build real (servidos como o backend os
//     serve) e respostas de API com dado de usuario plantado.
//
// O que isto NAO prova: o Cache Storage do navegador de verdade. Essa parte e
// a verificacao no Chromium (AUDIT_REPORT).

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const decodificador = new TextDecoder();

export function criarCacheStorage() {
  const caches = new Map();

  function chave(requisicao, base) {
    return new URL(typeof requisicao === "string" ? requisicao : requisicao.url, base).href;
  }

  function abrir(nome, base) {
    if (!caches.has(nome)) caches.set(nome, new Map());
    const entradas = caches.get(nome);
    return {
      async put(requisicao, resposta) {
        const corpo = new Uint8Array(await resposta.arrayBuffer());
        entradas.set(chave(requisicao, base), {
          status: resposta.status,
          headers: [...resposta.headers],
          corpo,
        });
      },
      async match(requisicao) {
        const entrada = entradas.get(chave(requisicao, base));
        if (!entrada) return undefined;
        return new Response(entrada.corpo.slice(), { status: entrada.status, headers: entrada.headers });
      },
      async keys() {
        return [...entradas.keys()].map((url) => new Request(url));
      },
      async delete(requisicao) {
        return entradas.delete(chave(requisicao, base));
      },
    };
  }

  return {
    // A API que o service worker (ou a pagina) recebe como `caches`.
    api(base) {
      return {
        open: async (nome) => abrir(nome, base),
        has: async (nome) => caches.has(nome),
        delete: async (nome) => caches.delete(nome),
        keys: async () => [...caches.keys()],
        match: async (requisicao) => {
          for (const nome of caches.keys()) {
            const resposta = await abrir(nome, base).match(requisicao);
            if (resposta) return resposta;
          }
          return undefined;
        },
      };
    },
    // Tudo o que esta guardado, cru: nome do cache, URL, cabecalhos e corpo.
    inspecionar() {
      const registros = [];
      for (const [nome, entradas] of caches) {
        for (const [url, entrada] of entradas) {
          registros.push({
            cache: nome,
            url,
            headers: Object.fromEntries(entrada.headers),
            corpo: entrada.corpo,
            texto: decodificador.decode(entrada.corpo),
          });
        }
      }
      return { nomes: [...caches.keys()], registros };
    },
    // Planta uma entrada direto, sem passar por service worker: simula o resto
    // de uma versao defeituosa, para provar que a limpeza o tira.
    async plantar(nome, url, corpo, headers = { "content-type": "application/json" }) {
      await abrir(nome, "https://app.nutriscan.test").put(url, new Response(corpo, { status: 200, headers }));
    },
  };
}

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

/**
 * A rede do teste. `arquivos(caminho)` devolve o conteudo de um arquivo do
 * build (ou null). A API devolve, por caminho, o que `api` mandar - com dado de
 * usuario, Set-Cookie e veredito plantados pelo teste.
 */
export function criarRede({ arquivos, api = {} }) {
  const estado = { semRede: false, pedidos: [] };

  async function rede(entrada, opcoes = {}) {
    const requisicao = entrada instanceof Request ? entrada : new Request(entrada, opcoes);
    estado.pedidos.push({ metodo: requisicao.method, url: requisicao.url });
    if (estado.semRede) throw new TypeError("Failed to fetch");
    const url = new URL(requisicao.url);
    const caminho = url.pathname;

    if (caminho.toLowerCase().startsWith("/api")) {
      const resposta = api[caminho.toLowerCase()] ?? api["*"];
      if (!resposta) return new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404, headers: { "content-type": "application/json" } });
      return resposta();
    }

    const conteudo = arquivos(caminho);
    if (conteudo !== null && conteudo !== undefined) {
      const extensao = path.extname(caminho);
      return new Response(conteudo, { status: 200, headers: { "content-type": TIPOS[extensao] || "application/octet-stream" } });
    }
    // Fallback do app, como o backend faz: qualquer rota que nao e arquivo nem
    // API devolve o index.html.
    const pagina = arquivos("/index.html");
    if (pagina !== null && pagina !== undefined) return new Response(pagina, { status: 200, headers: { "content-type": TIPOS[".html"] } });
    return new Response("nao encontrado", { status: 404 });
  }

  return { rede, estado };
}

// Os arquivos de uma pasta de build, pelo caminho da URL.
export function arquivosDaPasta(pasta) {
  return (caminho) => {
    const alvo = path.join(pasta, decodeURIComponent(caminho));
    if (!alvo.startsWith(path.resolve(pasta))) return null;
    try {
      if (!statSync(alvo).isFile()) return null;
      return readFileSync(alvo);
    } catch {
      return null;
    }
  };
}

/**
 * Carrega o codigo de um service worker num contexto proprio, com os globais
 * que o navegador da a ele, e devolve como disparar cada evento.
 */
export function carregarServiceWorker(codigo, { origem, cacheStorage, rede }) {
  const ouvintes = {};
  const registro = { skipWaiting: 0, claim: 0 };
  const escopo = {
    addEventListener(tipo, funcao) {
      (ouvintes[tipo] ||= []).push(funcao);
    },
    location: new URL("/sw.js", origem),
    caches: cacheStorage.api(origem),
    fetch: rede,
    Request,
    Response,
    Headers,
    URL,
    TextEncoder,
    TextDecoder,
    console,
    setTimeout,
    clearTimeout,
    clients: {
      claim: async () => {
        registro.claim += 1;
      },
    },
    skipWaiting: async () => {
      registro.skipWaiting += 1;
    },
  };
  escopo.self = escopo;
  vm.createContext(escopo);
  vm.runInContext(codigo, escopo);

  async function disparar(tipo, evento) {
    const esperas = [];
    evento.waitUntil = (promessa) => esperas.push(promessa);
    for (const ouvinte of ouvintes[tipo] || []) ouvinte(evento);
    await Promise.all(esperas);
    return evento;
  }

  return {
    registro,
    instalar: () => disparar("install", {}),
    ativar: () => disparar("activate", {}),
    mensagem: (data) => disparar("message", { data }),
    // `navegacao: true` marca a requisicao como navegacao de pagina. O Node nao
    // deixa construir Request com mode "navigate"; a marca fica no objeto, e o
    // codigo do service worker le `request.mode` como no navegador.
    async buscar(url, { metodo = "GET", navegacao = false, corpo } = {}) {
      const requisicao = new Request(new URL(url, origem), { method: metodo, body: corpo });
      if (navegacao) Object.defineProperty(requisicao, "mode", { value: "navigate" });
      let resposta = null;
      await disparar("fetch", {
        request: requisicao,
        respondWith(promessa) {
          resposta = promessa;
        },
      });
      if (resposta === null) return { interceptou: false };
      return { interceptou: true, resposta: await resposta };
    },
  };
}
