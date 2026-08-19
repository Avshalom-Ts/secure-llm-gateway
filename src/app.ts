import express, { type ErrorRequestHandler, type Express } from "express";
import { randomUUID } from "node:crypto";

import { errorBody, GatewayError } from "./errors.ts";
import type { AppConfig } from "./config.ts";
import { createAuditRouter } from "./routes/audit.ts";
import { createChatRouter, type ChatDependencies } from "./routes/chat.ts";

export type AppDependencies = ChatDependencies & {
  health?: {
    mongodb: () => Promise<boolean>;
    redis: () => Promise<boolean>;
  };
};

/**
 * Creates the Express application, registers health and API routes, and maps
 * unexpected failures to the gateway's safe error response format.
 * @param config Runtime configuration used for readiness reporting and metadata.
 * @param dependencies Optional repositories, rate limiter, provider, and health checks.
 * @returns A configured Express application instance.
 */
export function createApp(config: AppConfig, dependencies?: AppDependencies): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    const correlationId = randomUUID();
    response.locals.correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", async (_request, response) => {
    const dependencyStatus = dependencies?.health
      ? await Promise.all(
          [dependencies.health.mongodb, dependencies.health.redis].map(async (check) => {
            try {
              return (await check()) ? "ok" : "unavailable";
            } catch {
              return "unavailable";
            }
          }),
        )
      : ["not_checked", "not_checked"];
    const status = dependencies?.health
      ? dependencyStatus.every((component) => component === "ok") && config.providerConfigured
        ? "ok"
        : "degraded"
      : "ok";
    response.status(200).json({
      status,
      service: "secure-llm-gateway",
      environment: config.environment,
      provider: {
        name: config.llmProvider,
        configured: config.providerConfigured,
      },
      dependencies: {
        mongodb: dependencyStatus[0],
        redis: dependencyStatus[1],
      },
    });
  });

  if (dependencies) {
    app.use("/v1/chat", createChatRouter(dependencies));
    app.use("/v1/audit", createAuditRouter(dependencies.apiKeys, dependencies.audits));
  }

  const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    void next;
    const correlationId = response.locals.correlationId as string;
    const gatewayError =
      error instanceof GatewayError
        ? error
        : error instanceof SyntaxError
          ? new GatewayError("INVALID_REQUEST", 400, "The request body is invalid.")
          : new GatewayError("INTERNAL_ERROR", 500, "An internal error occurred.");

    console.error({
      correlationId,
      code: gatewayError.code,
      status: gatewayError.status,
    });
    response.status(gatewayError.status).json(errorBody(gatewayError, correlationId));
  };

  app.use(errorHandler);

  return app;
}
