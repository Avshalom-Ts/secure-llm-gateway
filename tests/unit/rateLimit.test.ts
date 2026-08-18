import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorBody, GatewayError } from "../../src/errors.ts";
import { enforceRateLimit } from "../../src/middleware/rateLimit.ts";
import { RedisRateLimiter, type RateLimiter } from "../../src/repositories/redisRateLimiter.ts";

function createTestApp(rateLimiter: RateLimiter) {
  const app = express();
  app.use((request, _response, next) => {
    request.auth = { keyId: "key-1", role: "client" };
    next();
  });
  app.use(enforceRateLimit(rateLimiter));
  app.get("/protected", (_request, response) => response.json({ status: "allowed" }));
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

describe("rate limiting", () => {
  it("allows requests below the configured limit and rejects exhausted windows", async () => {
    let calls = 0;
    const rateLimiter: RateLimiter = {
      consume: async (_keyId, limit) => {
        calls += 1;
        return calls <= 1 && limit === 30
          ? { allowed: true }
          : { allowed: false, retryAfterSeconds: 17 };
      },
    };
    const app = createTestApp(rateLimiter);

    expect((await request(app).get("/protected")).status).toBe(200);
    const limited = await request(app).get("/protected");
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("17");
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("uses a per-key override", async () => {
    let requestedLimit = 0;
    const rateLimiter: RateLimiter = {
      consume: async (_keyId, limit) => {
        requestedLimit = limit;
        return { allowed: true };
      },
    };
    const app = express();
    app.use((request, _response, next) => {
      request.auth = { keyId: "key-1", role: "client", rateLimitPerMinute: 7 };
      next();
    });
    app.use(enforceRateLimit(rateLimiter));
    app.get("/protected", (_request, response) => response.sendStatus(204));

    await request(app).get("/protected");
    expect(requestedLimit).toBe(7);
  });

  it("fails closed when Redis cannot enforce the limit", async () => {
    const app = createTestApp({
      consume: async () => {
        throw new Error("redis offline");
      },
    });

    const response = await request(app).get("/protected");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("executes the Redis script with a per-key sorted-set key", async () => {
    let received: { script: string; options: { keys: string[]; arguments: string[] } } | undefined;
    const client = {
      eval: async (script: string, options: { keys: string[]; arguments: string[] }) => {
        received = { script, options };
        return [1, 0];
      },
    };
    const limiter = new RedisRateLimiter(client);

    await expect(limiter.consume("key-1", 30, 1_000)).resolves.toEqual({ allowed: true });
    expect(received?.options.keys).toEqual(["rate:key-1"]);
    expect(received?.script).toContain("ZREMRANGEBYSCORE");
    expect(received?.script).toContain("ZADD");
  });
});
