import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { authRoutes } from "./routes/authRoutes.js";
import { assistantRoutes } from "./routes/assistantRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  app.use("/api", healthRoutes);
  app.use("/api/assistant", assistantRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/profile", profileRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
