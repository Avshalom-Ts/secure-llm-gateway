import { randomBytes } from "node:crypto";
import argon2 from "argon2";

import type { UserRole } from "../types.ts";
import type { ApiKeyRecord } from "./apiKeyRepository.ts";

export type LocalApiKey = {
  displayKey: string;
  record: ApiKeyRecord;
};

/**
 * Generates a local API key and returns its display value alongside the Argon2
 * record suitable for persistence.
 * @param keyId Public identifier to embed in the generated key.
 * @param role Authorization role assigned to the key.
 * @param rateLimitPerMinute Optional per-key request limit.
 * @returns The one-time display key and its hashed persistence record.
 */
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
