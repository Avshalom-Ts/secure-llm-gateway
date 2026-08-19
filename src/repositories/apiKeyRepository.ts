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

  /**
   * Creates a repository backed by the MongoDB API-key collection.
   * @param database Database containing API-key records.
   * @returns A MongoApiKeyRepository instance.
   */
  constructor(database: Db) {
    this.collection = database.collection<ApiKeyRecord>("apiKeys");
  }

  /**
   * Ensures API-key identifiers are unique in MongoDB.
   * @returns A promise resolved after the unique index exists.
   */
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ keyId: 1 }, { unique: true });
  }

  /**
   * Looks up one API-key record by its public identifier.
   * @param keyId Public key identifier supplied by the request.
   * @returns The matching record, or null when no record exists.
   */
  findByKeyId(keyId: string): Promise<ApiKeyRecord | null> {
    return this.collection.findOne({ keyId });
  }

  /**
   * Inserts or replaces an API-key record using its identifier as the key.
   * @param record API-key record to persist.
   * @returns A promise resolved after the record is saved.
   */
  async save(record: ApiKeyRecord): Promise<void> {
    await this.collection.replaceOne({ keyId: record.keyId }, record, { upsert: true });
  }
}
