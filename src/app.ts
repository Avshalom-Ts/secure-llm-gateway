import express, { type Express } from "express";

import type { AppConfig } from "./config.ts";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "secure-llm-gateway",
      environment: config.environment,
      provider: {
        name: config.llmProvider,
        configured: config.providerConfigured,
      },
      dependencies: {
        mongodb: "not_checked",
        redis: "not_checked",
      },
    });
  });

  return app;
}
