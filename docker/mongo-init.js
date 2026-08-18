/* global db */

const database = db.getSiblingDB("secure_llm_gateway");

if (!database.getCollectionNames().includes("apiKeys")) {
  database.createCollection("apiKeys");
}

if (!database.getCollectionNames().includes("auditLogs")) {
  database.createCollection("auditLogs");
}

database.apiKeys.createIndex({ keyId: 1 }, { unique: true });
database.auditLogs.createIndex({ timestamp: 1 });
database.auditLogs.createIndex({ apiKeyId: 1, timestamp: 1 });
