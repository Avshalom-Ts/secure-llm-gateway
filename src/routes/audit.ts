import { Router, type Request, type Response, type NextFunction } from "express";

import { GatewayError } from "../errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { requireAdmin } from "../middleware/authorise.ts";
import type { AuditRepository } from "../repositories/auditRepository.ts";
import type { ApiKeyRepository } from "../repositories/apiKeyRepository.ts";
import { auditQuerySchema } from "../security/validation.ts";

/**
 * Builds the administrator-only audit route and validates its query parameters.
 * @param apiKeys Repository used to authenticate API keys.
 * @param repository Repository used to read audit records.
 * @returns A router exposing the audit query endpoint.
 */
export function createAuditRouter(apiKeys: ApiKeyRepository, repository: AuditRepository): Router {
  const router = Router();
  router.use(authenticate(apiKeys));
  router.use(requireAdmin);
  router.get("/", async (request: Request, response: Response, next: NextFunction) => {
    let query: { since: Date; limit: number };
    try {
      query = auditQuerySchema.parse(request.query);
    } catch {
      next(new GatewayError("INVALID_REQUEST", 400, "The audit query is invalid."));
      return;
    }

    try {
      const records = await repository.findSince(query.since, query.limit);
      response.json({ records, correlationId: response.locals.correlationId });
    } catch {
      next(new GatewayError("DEPENDENCY_UNAVAILABLE", 503, "Audit storage is unavailable."));
    }
  });
  return router;
}
