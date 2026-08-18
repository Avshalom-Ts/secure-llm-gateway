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
    expect(response.headers["x-correlation-id"]).toEqual(expect.any(String));
  });

  it("returns a generic correlated error for malformed JSON", async () => {
    const response = await request(createApp(testConfig))
      .post("/v1/chat")
      .set("content-type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "INVALID_REQUEST",
      message: "The request body is invalid.",
      correlationId: expect.any(String),
    });
    expect(response.headers["x-correlation-id"]).toBe(response.body.error.correlationId);
  });
});
