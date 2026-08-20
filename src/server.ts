import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { MongoClient } from "mongodb";
import { createClient } from "redis";
import { MongoAuditRepository } from "./repositories/auditRepository.ts";
import { MongoApiKeyRepository } from "./repositories/apiKeyRepository.ts";
import { createRedisRateLimiter } from "./repositories/redisRateLimiter.ts";
import { createProvider } from "./providers/factory.ts";
import { createLogger } from "./logger.ts";

const config = loadConfig();
const logger = createLogger(config);
const mongo = new MongoClient(config.mongodbUri);
await mongo.connect();
const database = mongo.db();
const redis = createClient({ url: config.redisUrl });
redis.on("error", () => {
  logger.error({ component: "redis", reason: "connection_error" });
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
  logger.info({ port: config.port }, "secure-llm-gateway listening");
});

/**
 * Stops accepting requests and closes Redis and MongoDB connections gracefully.
 * @param signal Operating-system signal that initiated shutdown.
 * @returns A promise resolved after the server and dependencies close.
 */
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutting down");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await Promise.all([redis.quit(), mongo.close()]);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
