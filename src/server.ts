import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { MongoAuditRepository } from "./repositories/auditRepository.ts";
import { MongoApiKeyRepository } from "./repositories/apiKeyRepository.ts";
import { createRedisRateLimiter } from "./repositories/redisRateLimiter.ts";
import { createProvider } from "./providers/factory.ts";

const config = loadConfig();
const mongo = new MongoClient(config.mongodbUri);
await mongo.connect();
const database = mongo.db();
const redis = createClient({ url: config.redisUrl });
redis.on("error", () => {
  console.error({ component: "redis", reason: "connection_error" });
});
await redis.connect();

const apiKeys = new MongoApiKeyRepository(database);
const audits = new MongoAuditRepository(database);
await Promise.all([apiKeys.ensureIndexes(), audits.ensureIndexes()]);
const provider = createProvider(config.llmProvider, {
  openaiApiKey: config.openaiApiKey,
  anthropicApiKey: config.anthropicApiKey,
});
const app = createApp(config, {
  apiKeys,
  rateLimiter: createRedisRateLimiter(redis),
  provider,
  audits,
  health: {
    mongodb: async () => Boolean((await database.command({ ping: 1 })).ok),
    redis: async () => redis.isReady,
  },
});

const server = app.listen(config.port, () => {
  console.log(`secure-llm-gateway listening on port ${config.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`received ${signal}, shutting down`);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await Promise.all([redis.quit(), mongo.close()]);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
