import argon2 from "argon2";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { GatewayError } from "../errors.ts";
import type { ApiKeyRecord, ApiKeyRepository } from "../repositories/apiKeyRepository.ts";

const API_KEY_PATTERN = /^skg_([^_\s]+)_([^\s]+)$/;

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      keyId: string;
      role: ApiKeyRecord["role"];
      rateLimitPerMinute?: number;
    };
  }
}

export function parseApiKey(value: string | undefined): { keyId: string; secret: string } | null {
  if (!value) {
    return null;
  }

  const match = API_KEY_PATTERN.exec(value);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return { keyId: match[1], secret: match[2] };
}

export function authenticate(repository: ApiKeyRepository): RequestHandler {
  return async (request: Request, _response: Response, next: NextFunction) => {
    const parsedKey = parseApiKey(request.header("x-api-key"));
    if (!parsedKey) {
      next(new GatewayError("UNAUTHENTICATED", 401, "Authentication is required."));
      return;
    }

    try {
      const record = await repository.findByKeyId(parsedKey.keyId);
      if (
        !record ||
        !record.active ||
        !(await argon2.verify(record.secretHash, parsedKey.secret))
      ) {
        next(new GatewayError("UNAUTHENTICATED", 401, "Authentication is required."));
        return;
      }

      request.auth = {
        keyId: record.keyId,
        role: record.role,
        rateLimitPerMinute: record.rateLimitPerMinute,
      };
      next();
    } catch {
      next(new GatewayError("UNAUTHENTICATED", 401, "Authentication is required."));
    }
  };
}
