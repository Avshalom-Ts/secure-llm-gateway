import type { Collection, Db, Filter } from "mongodb";

import type { AuditRecord } from "../types.ts";

export interface AuditRepository {
  insert(record: AuditRecord): Promise<void>;
  findSince(since: Date, limit: number): Promise<AuditRecord[]>;
}

export class MongoAuditRepository implements AuditRepository {
  private readonly collection: Collection<AuditRecord>;

  constructor(database: Db) {
    this.collection = database.collection<AuditRecord>("auditLogs");
  }

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ timestamp: 1 }),
      this.collection.createIndex({ apiKeyId: 1, timestamp: 1 }),
    ]);
  }

  async insert(record: AuditRecord): Promise<void> {
    await this.collection.insertOne(record);
  }

  async findSince(since: Date, limit: number): Promise<AuditRecord[]> {
    const filter: Filter<AuditRecord> = { timestamp: { $gte: since } };
    return this.collection.find(filter).sort({ timestamp: 1 }).limit(limit).toArray();
  }
}
