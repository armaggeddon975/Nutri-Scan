// Convite para instalar o app (v0.13.0).
//
// QUANDO. Nao na primeira visita: ali a pessoa ainda nao sabe para que o app
// serve, e o convite seria ruido. O navegador que oferece instalacao (Chrome,
// Edge, Samsung Internet) mostraria uma barra sozinho ja na primeira visita; o
// pedido dele e segurado (`beforeinstallprompt`), e o convite do app aparece so
// depois de a pessoa ter aberto PRODUTOS_ANTES_DO_CONVITE produtos neste
// aparelho - quando ela ja viu um veredito e sabe o que esta instalando.
//
// ONDE. Na tela Inicio, abaixo das acoes principais. Nunca por cima de um
// veredito, nunca como janela.
//
// "Agora nao" dispensa de vez neste aparelho. A contagem e um numero, sem
// produto, sem conta: nao e dado de ninguem.
//
// No iPhone o Safari nao oferece esse pedido: la, instalar e pelo botao de
// compartilhar, "Adicionar a Tela de Inicio" (README).

export const PRODUTOS_ANTES_DO_CONVITE = 2;
export const CHAVE_DA_CONTAGEM = "nutriscan:produtos-abertos";
export const CHAVE_DA_DISPENSA = "nutriscan:convite-instalar";

export function criarConviteDeInstalacao({
  janela = () => globalThis.window,
  armazenamento = () => globalThis.localStorage,
} = {}) {
  let pedido = null;
  const ouvintes = new Set();

  function ler(chave) {
    try {
      return armazenamento()?.getItem(chave) ?? null;
    } catch {
      return null;
    }
  }
  function gravar(chave, valor) {
    try {
      armazenamento()?.setItem(chave, valor);
    } catch {
      // Sem armazenamento (navegacao privada): o convite so nao lembra.
    }
  }

  function estado() {
    const abertos = Number(ler(CHAVE_DA_CONTAGEM)) || 0;
    const dispensado = ler(CHAVE_DA_DISPENSA) !== null;
    return { mostrar: Boolean(pedido) && !dispensado && abertos >= PRODUTOS_ANTES_DO_CONVITE };
  }

  function notificar() {
    const atual = estado();
    for (const ouvinte of ouvintes) ouvinte(atual);
  }

  return {
    estado,
    ouvir() {
      try {
        const jan = janela();
        if (!jan || typeof jan.addEventListener !== "function") return;
        jan.addEventListener("beforeinstallprompt", (evento) => {
          evento.preventDefault();
          pedido = evento;
          notificar();
        });
        jan.addEventListener("appinstalled", () => {
          pedido = null;
          gravar(CHAVE_DA_DISPENSA, "instalado");
          notificar();
        });
      } catch {
        // Sem suporte: nao ha convite, e o app segue igual.
      }
    },
    aoMudar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    contarProdutoAberto() {
      const abertos = Number(ler(CHAVE_DA_CONTAGEM)) || 0;
      if (abertos < PRODUTOS_ANTES_DO_CONVITE) gravar(CHAVE_DA_CONTAGEM, String(abertos + 1));
      notificar();
    },
    async instalar() {
      if (!pedido) return "indisponivel";
      const atual = pedido;
      pedido = null;
      try {
        await atual.prompt();
        const escolha = await atual.userChoice;
        return escolha?.outcome ?? "desconhecido";
      } catch {
        return "falhou";
      } finally {
        notificar();
      }
    },
    dispensar() {
      gravar(CHAVE_DA_DISPENSA, "dispensado");
      notificar();
    },
  };
}

export const conviteDeInstalacao = criarConviteDeInstalacao();
