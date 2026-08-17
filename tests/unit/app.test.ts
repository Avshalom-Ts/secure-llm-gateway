import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";

const testConfig: AppConfig = {
  environment: "test",
  port: 3000,
  mongodbUri: "mongodb://localhost:27017/secure_llm_gateway",
  redisUrl: "redis://localhost:6379",
  llmProvider: "openai",
  providerConfigured: false,
  logLevel: "error",
};

describe("health endpoint", () => {
  it("reports safe startup status without credentials", async () => {
    const response = await request(createApp(testConfig)).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      provider: { name: "openai", configured: false },
      dependencies: { mongodb: "not_checked", redis: "not_checked" },
    });
    expect(JSON.stringify(response.body)).not.toContain("API_KEY");
  });
});
