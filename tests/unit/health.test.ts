import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp, type AppDependencies } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";

const config: AppConfig = {
  environment: "test",
  port: 3000,
  mongodbUri: "mongodb://127.0.0.1:27017/secure_llm_gateway",
  redisUrl: "redis://127.0.0.1:6379",
  llmProvider: "openai",
  providerConfigured: true,
  logLevel: "error",
};

const dependencies = (
  mongodb: () => Promise<boolean>,
  redis: () => Promise<boolean>,
): AppDependencies => ({
  apiKeys: { findByKeyId: async () => null },
  rateLimiter: { consume: async () => ({ allowed: true }) },
  provider: null,
  audits: { insert: async () => undefined, findSince: async () => [] },
  health: { mongodb, redis },
});

describe("health readiness", () => {
  it("reports ready when provider and dependencies are available", async () => {
    const response = await request(
      createApp(
        config,
        dependencies(
          async () => true,
          async () => true,
        ),
      ),
    ).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      provider: { configured: true },
      dependencies: { mongodb: "ok", redis: "ok" },
    });
  });

  it("reports degraded when a dependency check fails", async () => {
    const response = await request(
      createApp(
        config,
        dependencies(
          async () => false,
          async () => {
            throw new Error("offline");
          },
        ),
      ),
    ).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "degraded",
      dependencies: { mongodb: "unavailable", redis: "unavailable" },
    });
  });
});
