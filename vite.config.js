import { readFileSync } from "node:fs";

import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { listarArquivos, listasDoShell, montarServiceWorker } from "./src/sw/montarServiceWorker.js";

const pacote = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Service worker (v0.13.0): so no build. Gera `dist/sw.js` com a versao do
// package.json e a lista do que o build produziu - nenhuma lista escrita a mao.
// No `npm run dev` nao ha service worker, e o app funciona como sempre.
function serviceWorkerDoNutriScan() {
  let pastaPublica;
  return {
    name: "nutriscan-service-worker",
    apply: "build",
    // Por ultimo: a lista do shell precisa do index.html, que o Vite so emite
    // no fim do proprio generateBundle.
    enforce: "post",
    configResolved(config) {
      pastaPublica = config.publicDir;
    },
    async generateBundle(_opcoes, bundle) {
      const arquivos = [...Object.keys(bundle), ...(pastaPublica ? listarArquivos(pastaPublica) : [])];
      const { shell, precache } = listasDoShell(arquivos);
      const codigo = await montarServiceWorker({ versao: pacote.version, shell, precache });
      this.emitFile({ type: "asset", fileName: "sw.js", source: codigo });
    },
  };
}

// `npm run dev` -> http://localhost:5173 (só neste computador)
// `npm run dev:celular` -> https://<ip-da-rede>:5173
//
// A câmera (getUserMedia) e o login (crypto.subtle) só funcionam em contexto
// seguro: HTTPS ou localhost. Para testar no celular pela rede local é preciso
// HTTPS, por isso o certificado autoassinado abaixo. No celular o navegador vai
// avisar que o certificado não é confiável — escolha "Avançado" e prossiga.
export default defineConfig(({ mode }) => ({
  plugins: [react(), serviceWorkerDoNutriScan(), ...(mode === "rede" ? [basicSsl()] : [])],
  server: {
    host: mode === "rede" ? true : "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
}));
