// Limpeza do Cache Storage quando a pessoa volta a visitante - saiu, excluiu a
// conta, teve a sessao recusada (v0.13.0).
//
// O service worker so guarda o shell do app (politicaDeCache.js), que nao tem
// nada de nenhuma pessoa. Esta limpeza e a segunda camada: um aparelho
// compartilhado nao pode guardar nada de quem saiu, em NENHUM dos dois
// armazenamentos - o IndexedDB da v0.11.0 (aoPerderSessao) e este.
//
// - todo cache que nao e do shell do app sai inteiro;
// - dentro do cache do shell, toda entrada que nao tem a forma de arquivo do
//   shell sai (uma resposta de /api/, um JSON, qualquer coisa estranha).
//
// O shell fica: ele e de quem usa o aparelho, nao de uma conta, e e o que deixa
// o app abrir sem rede para a proxima pessoa.

import { PREFIXO_DO_CACHE, entradaLegitimaDoShell } from "./politicaDeCache.js";

export async function limparCacheStorage({
  cachesApi = globalThis.caches,
  origem = globalThis.location?.origin,
} = {}) {
  // Sem Cache Storage (navegador antigo, contexto nao seguro): nada guardado.
  if (!cachesApi || !origem) return { removidos: [], semCacheStorage: true };
  const removidos = [];
  try {
    for (const nome of await cachesApi.keys()) {
      if (!nome.startsWith(PREFIXO_DO_CACHE)) {
        await cachesApi.delete(nome);
        removidos.push(`cache:${nome}`);
        continue;
      }
      const cache = await cachesApi.open(nome);
      for (const requisicao of await cache.keys()) {
        if (!entradaLegitimaDoShell(requisicao.url, { origem })) {
          await cache.delete(requisicao);
          removidos.push(requisicao.url);
        }
      }
    }
    return { removidos };
  } catch (erro) {
    // A saida da conta nunca trava por causa desta limpeza.
    return { removidos, erro: String(erro?.message || erro) };
  }
}
