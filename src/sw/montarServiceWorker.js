// Monta o `dist/sw.js` (v0.13.0). Roda no Node, no build - nao vai para o app.
//
// O plugin do Vite (`vite.config.js`) chama `listasDoShell` com os arquivos que
// o build gerou e `montarServiceWorker` com a versao do package.json. Os testes
// chamam as MESMAS funcoes sobre um build real.

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));

// Todos os arquivos de uma pasta, com caminho relativo e barra normal.
export function listarArquivos(pasta, relativo = "") {
  const saida = [];
  for (const nome of readdirSync(path.join(pasta, relativo))) {
    const caminho = relativo ? `${relativo}/${nome}` : nome;
    if (statSync(path.join(pasta, caminho)).isDirectory()) saida.push(...listarArquivos(pasta, caminho));
    else saida.push(caminho);
  }
  return saida;
}

// O que da `public/` entra no pre-carregamento: o que a tela usa logo ao abrir
// e o que a instalacao pede. O resto de `public/` (o simbolo antigo da DG, que
// nenhuma tela usa) pode ser guardado se for pedido, mas nao e baixado de antemao.
export const PUBLICO_PRE_CARREGADO = [
  "/manifest.webmanifest",
  "/nutriscan-icon.svg",
  "/nutriscan-logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

// Fontes: o navegador so baixa a faixa de caracteres que a pagina usa, e em
// WOFF2. Portugues fica todo em "latin" e "latin-ext". As outras faixas
// (cirilico, vietnamita...) e o formato WOFF antigo existem no build, mas
// nenhum navegador atual os pede para um texto em portugues - pre-carrega-los
// so ocuparia espaco no aparelho.
function fontePreCarregada(caminho) {
  return /\.woff2$/.test(caminho) && /-latin-(ext-)?\d{3}-normal-/.test(caminho);
}

/**
 * Das saidas do build, a lista do shell (tudo que PODE ser guardado) e a do
 * pre-carregamento (o que e baixado na instalacao).
 * `arquivos`: nomes relativos a `dist/` ("index.html", "assets/x.js", ...).
 */
export function listasDoShell(arquivos) {
  const shell = arquivos
    .map((arquivo) => `/${arquivo.replace(/\\/g, "/").replace(/^\/+/, "")}`)
    .filter((caminho) => caminho !== "/sw.js")
    .sort();
  const precache = shell.filter((caminho) => {
    if (caminho === "/index.html") return true;
    if (/^\/assets\/.+\.(js|css|png|jpg|jpeg|svg|webp)$/.test(caminho)) return true;
    if (/^\/assets\/.+\.woff2?$/.test(caminho)) return fontePreCarregada(caminho);
    return PUBLICO_PRE_CARREGADO.includes(caminho);
  });
  for (const obrigatorio of ["/index.html", ...PUBLICO_PRE_CARREGADO]) {
    if (!precache.includes(obrigatorio)) throw new Error(`o build nao gerou ${obrigatorio}`);
  }
  return { shell, precache };
}

/**
 * O codigo do service worker, pronto para servir como `/sw.js`: um script
 * classico (IIFE), que todo navegador com service worker aceita.
 */
export async function montarServiceWorker({ versao, shell, precache }) {
  if (!versao) throw new Error("versao do app ausente");
  const { build } = await import("esbuild");
  const resultado = await build({
    entryPoints: [path.join(aqui, "service-worker.js")],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
    legalComments: "none",
    define: {
      __VERSAO_DO_APP__: JSON.stringify(versao),
      __SHELL_DO_APP__: JSON.stringify(shell),
      __PRECACHE_DO_APP__: JSON.stringify(precache),
    },
    logLevel: "silent",
  });
  return `// NutriScan ${versao} - service worker gerado no build. Nao edite: veja src/sw/.\n${resultado.outputFiles[0].text}`;
}
