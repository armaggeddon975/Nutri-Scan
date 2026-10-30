// Registro do service worker e atualizacao de versao (v0.13.0).
//
// O APP NAO DEPENDE DISTO. `main.jsx` desenha o app antes de chamar
// `registrar`, e `registrar` nunca lanca: navegador sem service worker,
// contexto nao seguro (http fora de localhost) ou registro que falha - o app
// segue como na v0.12.0, sem aviso, sem tela branca.
//
// ATUALIZACAO - O MOMENTO SEGURO. A versao nova se instala em segundo plano e
// ESPERA. Ela assume:
//   - sozinha, quando nenhuma aba da versao antiga estiver aberta (a proxima vez
//     que a pessoa abrir o app);
//   - ou quando a pessoa tocar em "Atualizar agora", no aviso de versao nova.
// A pagina so recarrega por esse toque. Nunca sozinha: a pessoa pode estar no
// meio de um veredito, de uma comparacao, digitando um codigo - recarregar ali
// apagaria o que ela esta lendo. E o aviso fica na tela ate ela atualizar:
// nao ha como ficar presa numa versao antiga sem ver o caminho de saida.
//
// Online, a PAGINA ja vem da rede a cada abertura (service-worker.js: rede
// primeiro). O que espera e o shell guardado para usar sem rede.

export const CAMINHO_DO_SERVICE_WORKER = "/sw.js";
export const ESCOPO_DO_SERVICE_WORKER = "/";
// Com a aba aberta por muito tempo (o app instalado fica aberto dias), a cada
// volta para a tela, no maximo uma vez por hora, o navegador confere se ha
// versao nova.
export const INTERVALO_DE_CONFERENCIA_MS = 60 * 60 * 1000;

export function criarServiceWorkerDoApp({
  navegador = () => globalThis.navigator,
  janela = () => globalThis.window,
  documento = () => globalThis.document,
  agora = () => Date.now(),
} = {}) {
  const ouvintes = new Set();
  let esperando = null;
  let recarregarQuandoTrocar = false;

  function avisar(worker) {
    esperando = worker;
    for (const ouvinte of ouvintes) ouvinte(true);
  }

  function observar(registro, servico) {
    // Ja havia uma versao esperando quando a pagina abriu.
    if (registro.waiting && servico.controller) avisar(registro.waiting);
    registro.addEventListener("updatefound", () => {
      const novo = registro.installing;
      if (!novo) return;
      novo.addEventListener("statechange", () => {
        // "installed" com uma versao no controle = versao nova esperando. Sem
        // ninguem no controle e a primeira instalacao: nao ha o que avisar.
        if (novo.state === "installed" && servico.controller) avisar(novo);
      });
    });
  }

  function conferirAoVoltar(registro) {
    const doc = documento();
    if (!doc || typeof doc.addEventListener !== "function") return;
    let ultima = agora();
    doc.addEventListener("visibilitychange", () => {
      if (doc.visibilityState !== "visible") return;
      if (agora() - ultima < INTERVALO_DE_CONFERENCIA_MS) return;
      ultima = agora();
      Promise.resolve()
        .then(() => registro.update())
        .catch(() => {});
    });
  }

  function registrar({ ativo = true } = {}) {
    try {
      if (!ativo) return Promise.resolve({ estado: "desligado" });
      const nav = navegador();
      const jan = janela();
      if (!jan || !jan.isSecureContext || !nav || !("serviceWorker" in nav) || !nav.serviceWorker) {
        return Promise.resolve({ estado: "sem-suporte" });
      }
      const servico = nav.serviceWorker;
      servico.addEventListener("controllerchange", () => {
        // So recarrega se a pessoa pediu. Uma troca de controle por outro
        // motivo (a primeira instalacao assumindo, outra aba atualizando) nao
        // recarrega esta.
        if (!recarregarQuandoTrocar) return;
        recarregarQuandoTrocar = false;
        jan.location.reload();
      });
      return Promise.resolve()
        .then(() =>
          servico.register(CAMINHO_DO_SERVICE_WORKER, { scope: ESCOPO_DO_SERVICE_WORKER, updateViaCache: "none" }),
        )
        .then((registro) => {
          observar(registro, servico);
          conferirAoVoltar(registro);
          return { estado: "registrado", registro };
        })
        .catch((erro) => ({ estado: "falhou", motivo: String(erro?.message || erro) }));
    } catch (erro) {
      return Promise.resolve({ estado: "falhou", motivo: String(erro?.message || erro) });
    }
  }

  return {
    registrar,
    // Avisa (true) quando ha versao nova esperando. Devolve como deixar de ouvir.
    aoTerVersaoNova(ouvinte) {
      ouvintes.add(ouvinte);
      if (esperando) ouvinte(true);
      return () => ouvintes.delete(ouvinte);
    },
    // O toque em "Atualizar agora": a versao nova assume e a pagina recarrega
    // quando ela estiver no controle.
    aplicarAtualizacao() {
      if (!esperando) return false;
      recarregarQuandoTrocar = true;
      esperando.postMessage({ tipo: "ATUALIZAR" });
      return true;
    },
  };
}

export const serviceWorkerDoApp = criarServiceWorkerDoApp();
