import type { Collection, Db } from "mongodb";

import type { UserRole } from "../types.ts";

export type ApiKeyRecord = {
  keyId: string;
  secretHash: string;
  role: UserRole;
  rateLimitPerMinute?: number;
  active: boolean;
};

export interface ApiKeyRepository {
  findByKeyId(keyId: string): Promise<ApiKeyRecord | null>;
}

export class MongoApiKeyRepository implements ApiKeyRepository {
  private readonly collection: Collection<ApiKeyRecord>;

  constructor(database: Db) {
    this.collection = database.collection<ApiKeyRecord>("apiKeys");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ keyId: 1 }, { unique: true });
  }

  findByKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    return this.collection.findOne({ keyId });
  }
}
