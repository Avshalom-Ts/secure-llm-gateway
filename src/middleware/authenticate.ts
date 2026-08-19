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

/**
 * Parses the expected secure gateway API-key format into its lookup id and secret.
 * @param value Value supplied by the client in the API-key header.
 * @returns Parsed key parts, or null when the value is missing or malformed.
 */
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

/**
 * Creates middleware that verifies an API key and attaches only safe identity
 * and rate-limit information to the request.
 * @param repository Repository used to retrieve the stored key record.
 * @returns Express middleware that authenticates each request.
 */
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
