import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// As duas familias vao empacotadas no build, nao vem de CDN: a CSP de producao
// so libera `font-src 'self' data:`, e uma fonte externa simplesmente nao
// carregaria. Sao importados apenas os pesos que a folha de estilo usa.
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
