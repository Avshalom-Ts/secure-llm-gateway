import type { Collection, Db, Filter } from "mongodb";

import type { AuditRecord } from "../types.ts";

export interface AuditRepository {
  insert(record: AuditRecord): Promise<void>;
  findSince(since: Date, limit: number): Promise<AuditRecord[]>;
}

export class MongoAuditRepository implements AuditRepository {
  private readonly collection: Collection<AuditRecord>;

  /**
   * Creates a repository backed by the MongoDB audit-log collection.
   * @param database Database containing audit records.
   * @returns A MongoAuditRepository instance.
   */
  constructor(database: Db) {
    this.collection = database.collection<AuditRecord>("auditLogs");
  }

  /**
   * Creates indexes used by audit time-range and API-key queries.
   * @returns A promise resolved after both indexes exist.
   */
  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ timestamp: 1 }),
      this.collection.createIndex({ apiKeyId: 1, timestamp: 1 }),
    ]);
  }

  /**
   * Appends one audit record to MongoDB.
   * @param record Sanitized audit record to persist.
   * @returns A promise resolved after insertion completes.
   */
  async insert(record: AuditRecord): Promise<void> {
    await this.collection.insertOne(record);
  }

  /**
   * Retrieves audit records at or after a timestamp in chronological order.
   * @param since Inclusive lower bound for record timestamps.
   * @param limit Maximum number of records to return.
   * @returns Matching audit records ordered from oldest to newest.
   */
  async findSince(since: Date, limit: number): Promise<AuditRecord[]> {
    const filter: Filter<AuditRecord> = { timestamp: { $gte: since } };
    return this.collection.find(filter).sort({ timestamp: 1 }).limit(limit).toArray();
  }
}
