// Service worker do NutriScan (v0.13.0). Cuida do APP, nunca dos dados.
//
// Este arquivo nao e servido como esta: `montarServiceWorker.js` o empacota no
// build (`dist/sw.js`), com a versao do app e a lista do shell no lugar das
// constantes abaixo. Toda decisao sobre o que guardar vem de `politicaDeCache.js`.
//
// ESTRATEGIA POR TIPO DE RECURSO
//   /api/* (toda a API, /api/health incluido)  o service worker nao toca: rede
//   outra origem (Open Food Facts)             o service worker nao toca: rede
//   escrita (POST, PUT, DELETE...)             o service worker nao toca: rede
//   a pagina (navegacao)                       rede primeiro; sem rede ou depois
//                                              do prazo, o index.html guardado
//                                              DESTA versao
//   arquivo do build (JS, CSS, fonte, icone)   cache primeiro: o nome do arquivo
//                                              muda a cada build, entao o que
//                                              esta guardado e o certo
//
// A pagina nunca e regravada pela rede: o index.html guardado e o desta versao,
// e aponta para os arquivos desta versao. Gravar o HTML de um build mais novo
// num cache mais velho quebraria o app sem rede.

import { DO_SHELL, NAVEGACAO, PRAZO_DA_NAVEGACAO_MS, estrategiaPara, nomeDoCache, podeGuardar } from "./politicaDeCache.js";

/* global __VERSAO_DO_APP__, __SHELL_DO_APP__, __PRECACHE_DO_APP__ */
const VERSAO = __VERSAO_DO_APP__;
const SHELL = __SHELL_DO_APP__;
const PRECACHE = __PRECACHE_DO_APP__;
const CACHE = nomeDoCache(VERSAO);
const PAGINA = "/index.html";

const contexto = () => ({ origem: self.location.origin, shell: SHELL });

async function guardarSePuder(cache, requisicao, resposta) {
  if (!podeGuardar(requisicao, resposta, contexto())) return false;
  await cache.put(requisicao, resposta.clone());
  return true;
}

// INSTALACAO: o shell inteiro desta versao, buscado na rede sem passar pelo
// cache HTTP. Se UM arquivo falhar, a instalacao falha e esta versao nao
// assume: shell pela metade abriria tela quebrada sem rede.
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const caminho of PRECACHE) {
        const requisicao = new Request(new URL(caminho, self.location.origin).href, { cache: "reload" });
        const resposta = await fetch(requisicao);
        if (!(await guardarSePuder(cache, requisicao, resposta))) {
          throw new Error(`shell incompleto: ${caminho} (${resposta.status})`);
        }
      }
    })(),
  );
  // Sem skipWaiting aqui: a versao nova espera. Ela assume quando nenhuma aba
  // da versao antiga estiver aberta, ou quando a pessoa tocar em "Atualizar".
});

// ATIVACAO: os caches de outras versoes saem. Fica so o desta.
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nome of await caches.keys()) {
        if (nome !== CACHE) await caches.delete(nome);
      }
      await self.clients.claim();
    })(),
  );
});

// A pessoa tocou em "Atualizar agora" (registro.js): esta versao assume ja.
self.addEventListener("message", (evento) => {
  if (evento.data && evento.data.tipo === "ATUALIZAR") self.skipWaiting();
});

function comPrazo(promessa, ms) {
  return new Promise((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new Error("prazo da rede")), ms);
    promessa.then(
      (valor) => {
        clearTimeout(relogio);
        resolver(valor);
      },
      (erro) => {
        clearTimeout(relogio);
        rejeitar(erro);
      },
    );
  });
}

async function paginaDoApp(requisicao) {
  try {
    return await comPrazo(fetch(requisicao), PRAZO_DA_NAVEGACAO_MS);
  } catch (erro) {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(PAGINA);
    if (guardada) return guardada;
    throw erro;
  }
}

async function arquivoDoShell(requisicao) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(requisicao);
  if (guardado) return guardado;
  const resposta = await fetch(requisicao);
  // Arquivo do shell que nao foi pre-carregado (outra faixa de fonte, por
  // exemplo): guardado na primeira vez, pela mesma regra.
  await guardarSePuder(cache, requisicao, resposta);
  return resposta;
}

self.addEventListener("fetch", (evento) => {
  const estrategia = estrategiaPara(evento.request, contexto());
  if (estrategia === NAVEGACAO) {
    evento.respondWith(paginaDoApp(evento.request));
  } else if (estrategia === DO_SHELL) {
    evento.respondWith(arquivoDoShell(evento.request));
  }
  // IGNORAR: sem respondWith. O navegador faz a requisicao como faria sem
  // service worker, e nada dela chega perto do Cache Storage.
});
