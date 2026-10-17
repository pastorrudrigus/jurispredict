import express from "express";
import fs from "node:fs";
import path from "node:path";
import { authMiddleware, authRoutes } from "./auth.js";
import { competitionRoutes } from "./demo/competition-routes.js";
import type { Store } from "./store.js";

export function createApp(store: Store, staticDir?: string) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  app.use(express.json({ limit: "200kb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", store.middleware());
  const auth = authRoutes(store);
  app.use("/api", auth.pub);
  app.use("/api", authMiddleware(store));
  app.use("/api", auth.priv);
  app.use("/api", competitionRoutes(store));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada.", code: "NOT_FOUND" }));
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  }
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if ((err as { type?: string })?.type === "entity.parse.failed")
      return res.status(400).json({ error: "JSON inválido.", code: "BAD_JSON" });
    console.error(err);
    res.status(500).json({ error: "Erro interno.", code: "INTERNAL" });
  });
  return app;
}
