import express, { type ErrorRequestHandler, type Express } from "express";
import { randomUUID } from "node:crypto";

import { errorBody, GatewayError } from "./errors.ts";
import type { AppConfig } from "./config.ts";

export function createApp(config: AppConfig): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    const correlationId = randomUUID();
    response.locals.correlationId = correlationId;
    response.setHeader("x-correlation-id", correlationId);
    next();
  });
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
