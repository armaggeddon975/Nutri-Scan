import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env, isProduction } from "./config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { assistantRoutes } from "./routes/assistantRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../../dist");

// O app consulta a Open Food Facts direto do navegador. Sem liberar esses
// dominios na CSP, a consulta e as imagens de produto quebram em producao
// enquanto continuam funcionando em desenvolvimento, onde nao ha CSP.
const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org";
const OPEN_FOOD_FACTS_IMAGES = [
  "https://images.openfoodfacts.org",
  "https://static.openfoodfacts.org",
  OPEN_FOOD_FACTS_API,
];

function buildContentSecurityPolicy() {
  const directives = {
    defaultSrc: ["'self'"],
    // A build do Vite nao gera script nem style inline: da para manter restrito.
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", "data:", ...OPEN_FOOD_FACTS_IMAGES],
    connectSrc: ["'self'", OPEN_FOOD_FACTS_API],
    fontSrc: ["'self'", "data:"],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  };

  // Em producao o app roda sob HTTPS; localmente isso atrapalharia o teste.
  if (isProduction()) directives.upgradeInsecureRequests = [];

  return { directives, useDefaults: false };
}

export function createApp() {
  const app = express();

  // Render e hospedagens equivalentes terminam TLS num proxy. Sem isto, o rate
  // limit enxerga o IP do proxy para todos os visitantes e `req.secure` mente.
  if (env.trustProxy) app.set("trust proxy", 1);

  app.use(helmet({ contentSecurityPolicy: buildContentSecurityPolicy() }));
  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  // Em producao o frontend e servido pelo proprio backend, na mesma origem.
  // Isso evita CORS e cookie de terceiro, como recomenda docs/ARCHITECTURE.md.
  const hasBuild = existsSync(path.join(distDir, "index.html"));
  if (hasBuild) {
    app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  }

  app.use("/api", healthRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);

  if (hasBuild) {
    // Qualquer rota que nao seja da API devolve o app. Rota de API inexistente
    // continua caindo no notFoundHandler, com erro JSON.
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
