import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MongoApiKeyRepository } from "../../src/repositories/apiKeyRepository.ts";
import { createLocalApiKey } from "../../src/repositories/localApiKey.ts";
import { RedisRateLimiter } from "../../src/repositories/redisRateLimiter.ts";

const mongo = new MongoClient(
  process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/secure_llm_gateway",
);
const redis = createClient({ url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379" });

beforeAll(async () => {
  await mongo.connect();
  await redis.connect();
});

afterAll(async () => {
  await redis.quit();
  await mongo.close();
});

describe("Docker infrastructure", () => {
  it("persists an Argon2 API-key record in MongoDB", async () => {
    const repository = new MongoApiKeyRepository(mongo.db());
    await repository.ensureIndexes();
    const generated = await createLocalApiKey(`integration-${Date.now()}`);

    await repository.save(generated.record);

    await expect(repository.findByKeyId(generated.record.keyId)).resolves.toMatchObject({
      keyId: generated.record.keyId,
      role: "client",
      active: true,
    });
  });

  it("enforces the sliding window through real Redis", async () => {
    const limiter = new RedisRateLimiter(redis);
    const keyId = `integration-rate-${Date.now()}`;

    await expect(limiter.consume(keyId, 2, 1_000)).resolves.toEqual({ allowed: true });
    await expect(limiter.consume(keyId, 2, 2_000)).resolves.toEqual({ allowed: true });
    const limited = await limiter.consume(keyId, 2, 3_000);

    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
  });
});
