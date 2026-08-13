import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev`    -> http://localhost:5173 (só neste computador)
// `npm run dev:celular` -> https://<ip-da-rede>:5173
//
// A câmera (getUserMedia) e o login (crypto.subtle) só funcionam em contexto
// seguro: HTTPS ou localhost. Para testar no celular pela rede local é preciso
// HTTPS, por isso o certificado autoassinado abaixo. No celular o navegador vai
// avisar que o certificado não é confiável — escolha "Avançado" e prossiga.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "rede" ? [basicSsl()] : [])],
  server: {
    host: mode === "rede" ? true : "127.0.0.1",
    port: 5173,
  },
}));
