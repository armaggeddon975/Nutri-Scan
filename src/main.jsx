import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { conviteDeInstalacao } from "./sw/instalacao.js";
import { serviceWorkerDoApp } from "./sw/registro.js";

// Fontes empacotadas no build, nao carregadas do Google: a CSP do backend so
// libera fonte da propria origem, o app promete funcionar sem internet para os
// alimentos locais, e nenhum visitante precisa avisar um terceiro que abriu o
// app. Serifa para titulos (conversa com a logo da DG), sans humanista para
// leitura. So os pesos usados, para nao inflar o bundle.
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./styles.css";
// Telas criadas depois do pacote de design; ver o cabecalho do arquivo.
import "./styles-v070.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// O app ja esta na tela. O service worker vem DEPOIS, e nada depende dele: sem
// suporte, fora de contexto seguro ou com o registro falhando, o app segue como
// na v0.12.0 (v0.13.0). Em `npm run dev` nao ha service worker.
conviteDeInstalacao.ouvir();
serviceWorkerDoApp.registrar({ ativo: import.meta.env.PROD });
