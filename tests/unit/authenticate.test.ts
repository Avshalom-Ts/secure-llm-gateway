import express from "express";
import argon2 from "argon2";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { authenticate, parseApiKey } from "../../src/middleware/authenticate.ts";
import { requireAdmin } from "../../src/middleware/authorise.ts";
import { errorBody, GatewayError } from "../../src/errors.ts";
import type { ApiKeyRecord, ApiKeyRepository } from "../../src/repositories/apiKeyRepository.ts";
import { createLocalApiKey } from "../../src/repositories/localApiKey.ts";

const secret = "local-test-secret";

/**
 * Creates an Express app for exercising authentication and authorization middleware.
 * @param repository API-key repository supplied to the authentication middleware.
 * @param adminOnly Whether the protected route also requires administrator access.
 * @returns An Express app exposing the protected test route.
 */
function createTestApp(repository: ApiKeyRepository, adminOnly = false) {
  const app = express();
  app.use(authenticate(repository));
  if (adminOnly) {
    app.use(requireAdmin);
  }
  app.get("/protected", (request, response) => {
    response.json({ keyId: request.auth?.keyId, role: request.auth?.role });
  });
  app.use(
    (
      error: GatewayError,
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      const correlationId = request.header("x-correlation-id") ?? "test-correlation-id";
      response.status(error.status).json(errorBody(error, correlationId));
    },
  );
  return app;
}

describe("API-key authentication", () => {
  it("parses only the expected key shape", () => {
    expect(parseApiKey("skg_key-1_secret")).toEqual({ keyId: "key-1", secret: "secret" });
    expect(parseApiKey(undefined)).toBeNull();
    expect(parseApiKey("invalid")).toBeNull();
    expect(parseApiKey("skg_key-1_secret with spaces")).toBeNull();
  });

  it("rejects missing, malformed, inactive, and invalid keys", async () => {
    const hash = await argon2.hash(secret);
    const records = new Map<string, ApiKeyRecord>([
      ["inactive", { keyId: "inactive", secretHash: hash, role: "client", active: false }],
      ["active", { keyId: "active", secretHash: hash, role: "client", active: true }],
    ]);
    const repository: ApiKeyRepository = {
      findByKeyId: async (keyId) => records.get(keyId) ?? null,
    };
    const app = createTestApp(repository);

    for (const key of [undefined, "invalid", "skg_inactive_secret", "skg_active_wrong"]) {
      const response = await request(app)
        .get("/protected")
        .set("x-api-key", key ?? "");
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it("attaches only safe key context after verification", async () => {
    const repository: ApiKeyRepository = {
      findByKeyId: async () => ({
        keyId: "client-1",
        secretHash: await argon2.hash(secret),
        role: "client",
        rateLimitPerMinute: 12,
        active: true,
      }),
    };

    const response = await request(createTestApp(repository))
      .get("/protected")
      .set("x-api-key", `skg_client-1_${secret}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ keyId: "client-1", role: "client" });
    expect(JSON.stringify(response.body)).not.toContain(secret);
  });

  it("restricts admin routes from authenticated clients", async () => {
    const repository: ApiKeyRepository = {
      findByKeyId: async () => ({
        keyId: "client-1",
        secretHash: await argon2.hash(secret),
        role: "client",
        active: true,
      }),
    };

    const response = await request(createTestApp(repository, true))
      .get("/protected")
      .set("x-api-key", `skg_client-1_${secret}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("creates a local key with only a hash in the persistence record", async () => {
    const generated = await createLocalApiKey("local-admin", "admin");

    expect(generated.displayKey).toMatch(/^skg_local-admin_[^\s]+$/);
    expect(generated.record).toMatchObject({ keyId: "local-admin", role: "admin", active: true });
    expect(generated.record.secretHash).not.toContain(generated.displayKey);
    const generatedSecret = generated.displayKey.slice("skg_local-admin_".length);
    expect(await argon2.verify(generated.record.secretHash, generatedSecret)).toBe(true);
  });
});
