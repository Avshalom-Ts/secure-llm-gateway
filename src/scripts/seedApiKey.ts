import { MongoClient } from "mongodb";

import { loadConfig } from "../config.ts";
import { MongoApiKeyRepository } from "../repositories/apiKeyRepository.ts";
import { createLocalApiKey } from "../repositories/localApiKey.ts";
import type { UserRole } from "../types.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const keyId = argument("--key-id") ?? "local-client";
const role = (argument("--role") ?? "client") as UserRole;
const rateLimit = Number(argument("--rate-limit") ?? "30");

if (
  !/^[a-zA-Z0-9-]+$/.test(keyId) ||
  !["client", "admin"].includes(role) ||
  !Number.isInteger(rateLimit)
) {
  throw new Error(
    "Usage: bun run seed:key -- --key-id <id> --role <client|admin> --rate-limit <integer>",
  );
}

const config = loadConfig();
const mongo = new MongoClient(config.mongodbUri);

try {
  await mongo.connect();
  const repository = new MongoApiKeyRepository(mongo.db());
  await repository.ensureIndexes();
  const generated = await createLocalApiKey(keyId, role, rateLimit);
  await repository.save(generated.record);
  console.log(`API key created for ${role} role: ${generated.displayKey}`);
  console.log("Store this value securely; it cannot be recovered from MongoDB.");
} finally {
  await mongo.close();
}
