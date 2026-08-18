import type { NextFunction, Request, RequestHandler, Response } from "express";

import { GatewayError } from "../errors.ts";
import type { RateLimiter } from "../repositories/redisRateLimiter.ts";

const DEFAULT_RATE_LIMIT = 30;

export function enforceRateLimit(rateLimiter: RateLimiter): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction) => {
    const auth = request.auth;
    if (!auth) {
      next(new GatewayError("UNAUTHENTICATED", 401, "Authentication is required."));
      return;
    }

    try {
      const result = await rateLimiter.consume(
        auth.keyId,
        auth.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT,
      );
      if (!result.allowed) {
        response.setHeader("retry-after", String(result.retryAfterSeconds ?? 1));
        next(
          new GatewayError("RATE_LIMITED", 429, "Rate limit exceeded.", result.retryAfterSeconds),
        );
        return;
      }
      next();
    } catch {
      next(
        new GatewayError("DEPENDENCY_UNAVAILABLE", 503, "A required dependency is unavailable."),
      );
    }
  };
}
