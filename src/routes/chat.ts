import { Router, type NextFunction, type Request, type Response } from "express";

import { GatewayError } from "../errors.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { enforceRateLimit } from "../middleware/rateLimit.ts";
import type { AuditRepository } from "../repositories/auditRepository.ts";
import type { ApiKeyRepository } from "../repositories/apiKeyRepository.ts";
import type { RateLimiter } from "../repositories/redisRateLimiter.ts";
import { detectInjection } from "../security/injection.ts";
import { sha256 } from "../security/hashing.ts";
import { validateProviderOutput } from "../security/outputValidation.ts";
import { tokenizeMessages } from "../security/pii.ts";
import { parseChatRequest } from "../security/validation.ts";
import type { Provider } from "../providers/types.ts";
import type { AuditRecord } from "../types.ts";

export type ChatDependencies = {
  apiKeys: ApiKeyRepository;
  rateLimiter: RateLimiter;
  provider: Provider | null;
  audits: AuditRepository;
};

function correlationId(response: Response): string {
  return response.locals.correlationId as string;
}

async function writeAudit(audits: AuditRepository, record: AuditRecord): Promise<void> {
  try {
    await audits.insert(record);
  } catch {
    throw new GatewayError("DEPENDENCY_UNAVAILABLE", 503, "Audit logging is unavailable.");
  }
}

export function createChatRouter(dependencies: ChatDependencies): Router {
  const router = Router();
  router.use(authenticate(dependencies.apiKeys));
  router.use(enforceRateLimit(dependencies.rateLimiter));
  router.post("/", async (request: Request, response: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const id = correlationId(response);
    let parsedRequest: ReturnType<typeof parseChatRequest>;
    try {
      parsedRequest = parseChatRequest(request.body);
    } catch {
      next(new GatewayError("INVALID_REQUEST", 400, "The chat request is invalid."));
      return;
    }

    const requestHash = sha256(parsedRequest);
    const detectedThreats = parsedRequest.messages.flatMap((message) =>
      detectInjection(message.content),
    );
    if (detectedThreats.length > 0) {
      const record: AuditRecord = {
        timestamp: new Date(),
        correlationId: id,
        apiKeyId: request.auth?.keyId,
        model: parsedRequest.model,
        requestHash,
        detectedThreats: [...new Set(detectedThreats)],
        piiTokenCount: 0,
        latencyMs: Date.now() - startedAt,
        status: "blocked",
        reason: "PROMPT_INJECTION_DETECTED",
      };
      await writeAudit(dependencies.audits, record);
      next(new GatewayError("PROMPT_INJECTION_DETECTED", 400, "The request was blocked."));
      return;
    }

    if (!dependencies.provider) {
      await writeAudit(dependencies.audits, {
        timestamp: new Date(),
        correlationId: id,
        apiKeyId: request.auth?.keyId,
        model: parsedRequest.model,
        requestHash,
        detectedThreats: [],
        piiTokenCount: 0,
        latencyMs: Date.now() - startedAt,
        status: "error",
        reason: "PROVIDER_UNAVAILABLE",
      });
      next(
        new GatewayError("PROVIDER_UNAVAILABLE", 503, "The configured provider is unavailable."),
      );
      return;
    }

    const tokenized = tokenizeMessages(parsedRequest.messages);
    const providerRequest = {
      model: parsedRequest.model,
      messages: tokenized.messages,
      maxTokens: parsedRequest.max_tokens,
      temperature: parsedRequest.temperature,
    };

    try {
      const providerResponse = await dependencies.provider.complete(providerRequest);
      const outputThreats = validateProviderOutput(providerResponse.content, detectedThreats);
      const responseHash = sha256(providerResponse.content);
      if (outputThreats.length > 0) {
        await writeAudit(dependencies.audits, {
          timestamp: new Date(),
          correlationId: id,
          apiKeyId: request.auth?.keyId,
          model: providerResponse.model,
          requestHash,
          responseHash,
          detectedThreats: outputThreats,
          piiTokenCount: tokenized.piiTokenCount,
          latencyMs: Date.now() - startedAt,
          status: "blocked",
          reason: "UNSAFE_PROVIDER_OUTPUT",
        });
        next(new GatewayError("UNSAFE_PROVIDER_OUTPUT", 422, "The provider response was blocked."));
        return;
      }

      await writeAudit(dependencies.audits, {
        timestamp: new Date(),
        correlationId: id,
        apiKeyId: request.auth?.keyId,
        model: providerResponse.model,
        requestHash,
        responseHash,
        detectedThreats: [],
        piiTokenCount: tokenized.piiTokenCount,
        latencyMs: Date.now() - startedAt,
        status: "allowed",
      });
      response.status(200).json({
        model: providerResponse.model,
        content: providerResponse.content,
        correlationId: id,
      });
    } catch (error) {
      if (error instanceof GatewayError) {
        next(error);
        return;
      }
      await writeAudit(dependencies.audits, {
        timestamp: new Date(),
        correlationId: id,
        apiKeyId: request.auth?.keyId,
        model: parsedRequest.model,
        requestHash,
        detectedThreats: [],
        piiTokenCount: tokenized.piiTokenCount,
        latencyMs: Date.now() - startedAt,
        status: "error",
        reason: "PROVIDER_ERROR",
      });
      next(new GatewayError("PROVIDER_ERROR", 502, "The provider request failed."));
    }
  });

  return router;
}
