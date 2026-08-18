import { randomBytes } from "node:crypto";
import argon2 from "argon2";

import type { UserRole } from "../types.ts";
import type { ApiKeyRecord } from "./apiKeyRepository.ts";

export type LocalApiKey = {
  displayKey: string;
  record: ApiKeyRecord;
};

export async function createLocalApiKey(
  keyId: string,
  role: UserRole = "client",
  rateLimitPerMinute?: number,
): Promise<LocalApiKey> {
  const secret = randomBytes(24).toString("base64url");
  const displayKey = `skg_${keyId}_${secret}`;
  const record: ApiKeyRecord = {
    keyId,
    secretHash: await argon2.hash(secret),
    role,
    rateLimitPerMinute,
    active: true,
  };

  return { displayKey, record };
}
