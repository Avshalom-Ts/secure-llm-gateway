import type { RedisClientType } from "redis";

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export interface RateLimiter {
  consume(keyId: string, limit: number, nowMs?: number): Promise<RateLimitResult>;
}

const WINDOW_MS = 60_000;
const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
  return {0, math.max(1, math.ceil((tonumber(oldest) + window - now) / 1000))}
end
redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, 61)
return {1, 0}
`;

type RedisEvalClient = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly client: RedisEvalClient) {}

  async consume(keyId: string, limit: number, nowMs = Date.now()): Promise<RateLimitResult> {
    try {
      const result = await this.client.eval(RATE_LIMIT_SCRIPT, {
        keys: [`rate:${keyId}`],
        arguments: [String(nowMs), String(WINDOW_MS), String(limit), `${nowMs}-${Math.random()}`],
      });
      const values = Array.isArray(result) ? result.map(Number) : [];
      const allowed = values[0] === 1;
      return allowed
        ? { allowed: true }
        : { allowed: false, retryAfterSeconds: Math.max(1, values[1] ?? 1) };
    } catch {
      throw new Error("RATE_LIMIT_DEPENDENCY_UNAVAILABLE");
    }
  }
}

export function createRedisRateLimiter(client: RedisClientType): RateLimiter {
  return new RedisRateLimiter(client);
}
