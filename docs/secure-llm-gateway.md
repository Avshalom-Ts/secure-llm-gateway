# Secure LLM Gateway - implementation plan

## 1. Goal and boundaries

Build a small, production-oriented TypeScript/Express service that is the single controlled path from internal applications to a configured OpenAI or Anthropic model. The gateway must treat both incoming prompts and provider output as untrusted, apply uniform controls, and retain a minimally sensitive audit trail.

The first delivery should optimise for a working, testable security pipeline rather than broad provider features. The public surface is deliberately small:

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /v1/chat` | client or admin key | Validate, secure, proxy, validate output, audit, return result. |
| `GET /v1/audit?since=<ISO-8601>&limit=<1..500>` | admin key | Return sanitised audit records since a time. |
| `GET /healthz` | none | Report liveness and dependency/provider configuration readiness. |

Explicit non-goals for the first cut: streaming responses, tool/function calling, file uploads, multi-turn server-side conversation storage, a UI, billing, and a full DLP engine. These should be stated in the README as limitations instead of silently implied support.

## 2. System design

```text
Internal application
  | x-api-key + chat payload
  v
Express API
  -> request/correlation logging (redacted)
  -> API-key authentication and role authorisation
  -> per-key Redis sliding-window rate limit
  -> request-schema validation and size limits
  -> prompt-injection detection
  -> inbound PII tokenisation/redaction
  -> provider adapter (OpenAI or Anthropic)
  -> outbound secret / injection-echo validation
  -> Mongo audit record (hashes and metadata only)
  v
Sanitised provider response
```

Each security decision belongs in an independently testable module. Route code should orchestrate modules and translate their typed results into HTTP responses; it should not contain regular expressions, Mongo queries, Redis scripts, or provider-specific request construction.

Suggested request lifecycle:

1. Create a correlation ID and start a latency timer.
2. Authenticate `x-api-key`, using a hashed lookup and a constant-time comparison where applicable. Attach an internal key ID, role, and per-key rate-limit override to the request context. Never attach or log the raw key after this point.
3. Require `admin` role for audit reads.
4. Enforce a Redis sliding window keyed by immutable API-key ID. Return `429` with a retry indication if exhausted.
5. Parse the chat body with a strict schema: allowed model enum, non-empty messages, only approved roles, content length/message-count limits, and bounded `max_tokens`.
6. Inspect every inbound message for injection patterns. On a match, return `400`, record a blocked audit event, and do not call the provider.
7. Replace recognised PII with opaque tokens. Keep the reversible mapping only for the audit-time recovery workflow; do not send originals to the model or place them in normal logs.
8. Call the provider through a small adapter interface. If configuration is absent, return `503`; timeout and provider errors become controlled `502`/`503` responses and are audited as errors.
9. Inspect generated content. Block responses containing provider/API secrets or an echo of a detected injection pattern. Do not return blocked output to the caller.
10. Persist an audit record for every outcome and return an allowed, sanitised response only after the output check succeeds.

## 3. Data model

### MongoDB collections

`apiKeys`

```ts
type ApiKey = {
  _id: ObjectId;
  keyId: string;                 // public internal identifier, e.g. key_...
  secretHash: string;            // Argon2id or bcrypt hash; never raw key
  role: 'client' | 'admin';
  rateLimitPerMinute?: number;   // default 30
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

`auditLogs`

```ts
type AuditLog = {
  _id: ObjectId;
  timestamp: Date;
  correlationId: string;
  apiKeyId?: string;
  model?: 'gpt-4o' | 'claude-3-5-sonnet';
  requestHash?: string;          // SHA-256 of canonicalised, pre-redaction request
  responseHash?: string;         // SHA-256 of returned/provider output, per policy
  detectedThreats: ThreatCode[];
  piiTokenCount: number;
  latencyMs: number;
  status: 'allowed' | 'blocked' | 'error';
  reason?: string;               // stable reason code, not sensitive prompt text
};
```

Use indexes on `apiKeys.keyId` (unique), `auditLogs.timestamp`, and `{ apiKeyId, timestamp }`. Do not store message text, raw PII, raw API keys, provider credentials, or provider output in the standard audit record.

For reversible PII, use a separate, access-controlled encrypted token vault/collection with an expiry (TTL index). A token should be random and non-meaningful, for example `[PII:email:4f2a...]`. Encrypt values with an environment-supplied data-encryption key and restrict detokenisation to an explicit audited administrative workflow. If that workflow cannot be delivered safely in the timebox, retain tokens only and document reversible recovery as a known limitation rather than claiming it works.

### Redis keys

Use a key such as `rate:{apiKeyId}` with sorted-set timestamps. On each request, atomically remove scores older than 60 seconds, count, add the current request when permitted, and set a short expiry. Use a Lua script or Redis transaction to avoid a race between count and add. Do not key limits by IP address when the requirement is per API key.

## 4. Security-control design

### Authentication and authorisation

- Require a non-empty `x-api-key` for protected endpoints.
- Store a generated key ID plus a slow password hash of the secret. A practical key format is `skg_<keyId>_<secret>` so lookup can use `keyId` and verification can use the password-hash verifier.
- Return `401` for missing, malformed, inactive, or invalid keys; return `403` for a valid non-admin key requesting `/v1/audit`.
- Apply generic error messages and structured logs that include only `keyId` and correlation ID.

### Prompt-injection detection

Implement a normalisation step before matching: Unicode normalisation, whitespace collapsing, case folding, removal of zero-width characters, and a bounded leetspeak/punctuation variant strategy. Preserve the original separately only long enough to redact/audit safely.

At minimum, implement and test distinct pattern families:

1. Role/instruction override: variants of “ignore/disregard previous instructions”, “override system/developer prompt”, and attempts to change the assistant’s role.
2. Prompt/data exfiltration: requests for the system prompt, hidden instructions, policies, credentials, API keys, or internal context.
3. Delimiter and control-token attacks: embedded pseudo-system messages, XML/markdown delimiter spoofing, and “begin/end system prompt” style payloads.

Return typed `ThreatCode` values rather than a bare Boolean so auditing and test assertions are clear. Regex is suitable for a timed challenge if patterns are narrow, normalised, documented, and extensively adversarially tested. It is not a complete semantic defence; say so in the README.

### Inbound PII redaction

Detect and tokenise:

- Email addresses.
- Phone numbers, including Israeli formats (`05x...`, `+972...`, `00972...`) and reasonable international E.164-style values.
- Israeli national IDs: eight or nine digits, validated with the checksum algorithm to reduce false positives.

Run detection after input validation and before provider invocation. Use a single per-request token map so repeated values map to the same token within that request. Test normal, formatted, and invalid/checksum-failing examples.

### Outbound validation

Reject provider output containing:

- OpenAI-style secret prefixes (`sk-...`), with an appropriately bounded token length.
- JWT-like strings (`base64url.base64url.base64url`) while accepting ordinary dotted prose where possible.
- AWS access-key IDs (for example `AKIA` followed by 16 uppercase alphanumeric characters).
- An echo of a detected inbound injection, using the same normalised matching approach.

Blocking must prevent the output from reaching the caller. Audit only the threat codes and a response hash; do not log the suspected secret.

## 5. Code layout

```text
src/
  app.ts                         Express composition and middleware order
  server.ts                      configuration, dependency connection, startup
  config.ts                      validated environment configuration
  routes/chat.ts
  routes/audit.ts
  routes/health.ts
  middleware/authenticate.ts
  middleware/authorise.ts
  middleware/rateLimit.ts
  middleware/errorHandler.ts
  security/injection.ts
  security/pii.ts
  security/outputValidation.ts
  security/hashing.ts
  providers/types.ts
  providers/openai.ts
  providers/anthropic.ts
  services/audit.ts
  services/tokenVault.ts
  repositories/apiKeyRepository.ts
  repositories/auditRepository.ts
  repositories/redisRateLimiter.ts
  types/
  tests/
  unit/security/*.test.ts
  unit/middleware/*.test.ts
  integration/chat.test.ts
```

Use a `Provider` interface so the route only knows `complete(request): Promise<ProviderResponse>`. Select exactly one provider through configuration (`LLM_PROVIDER=openai|anthropic`) but keep the other adapter structurally ready. Validate all environment variables at startup with Zod or an equivalent schema.

## 6. HTTP behaviour and error contract

Use a consistent response shape, for example `{ error: { code, message, correlationId } }`. Suggested outcomes:

| Situation | Status | Example code |
| --- | ---: | --- |
| Missing/invalid API key | 401 | `UNAUTHENTICATED` |
| Authenticated, wrong role | 403 | `FORBIDDEN` |
| Invalid request body or inbound injection | 400 | `INVALID_REQUEST` / `PROMPT_INJECTION_DETECTED` |
| Rate limit exceeded | 429 | `RATE_LIMITED` |
| Provider not configured | 503 | `PROVIDER_UNAVAILABLE` |
| Provider timeout/failure | 502 or 503 | `PROVIDER_ERROR` |
| Unsafe provider output | 422 | `UNSAFE_PROVIDER_OUTPUT` |

`GET /healthz` should report overall status plus named component states such as Mongo reachable, Redis reachable, and provider configured. It must never reveal provider keys or full connection strings.

## 7. Tests and verification

Use Vitest for unit tests and dependency fakes for fast, deterministic testing. At minimum:

- Authentication: missing/invalid/inactive/valid keys; role restriction; no raw key in logs or audit values.
- Rate limiting: 30th request allowed, 31st blocked, configurable key override, old entries expire, concurrent increments are atomic.
- Injection: every supplied corpus case plus case, whitespace, punctuation, zero-width, and role-token variations.
- PII: email, Israeli phone, international phone, valid eight/nine-digit Israeli IDs, checksum-invalid values, repeated token consistency, and absence of original PII from provider payload.
- Output checks: secret/JWT/AWS matches, safe output, blocked output never returned, injection echo.
- Chat integration: allowed flow, each blocked stage, missing provider key returning 503, audit record content and status.
- Health: healthy and each degraded dependency scenario.

Use Bun for local and CI JavaScript tooling. Run `bun run type-check`, `bun test`, and a Docker Compose smoke test before submission. Add CI to run type-check, tests, and Gitleaks on push/pull request. Commit `bun.lock` and use `bun install --frozen-lockfile` in CI.

## 8. Containers, configuration, and secrets

Use a multi-stage Dockerfile that builds TypeScript and runs as a non-root production user. `docker-compose.yml` should start the API, MongoDB, and Redis with health checks and declared dependency ordering. Provide `.env.example`, never `.env` with real credentials.

Expected variables:

```dotenv
PORT=3000
MONGODB_URI=mongodb://mongo:27017/secure_llm_gateway
REDIS_URL=redis://redis:6379
LLM_PROVIDER=openai
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
PII_ENCRYPTION_KEY=
LOG_LEVEL=info
```

Add `.gitleaks.toml`, ignore only intentional test fixtures with narrow rules, and run Gitleaks in CI. Avoid placing credential-shaped strings in fixtures unless explicitly allowlisted with an explanation.

## 9. Implementation sequence

1. Initialise strict TypeScript, lint/test tooling, Docker Compose skeleton, config validation, and health endpoint.
2. Add Mongo/Redis repositories, API-key model/seed utility, auth/role middleware, and tests.
3. Add atomic rate limiting and tests.
4. Implement security modules with a corpus-driven suite before connecting the provider.
5. Add audit persistence and ensure every exit path produces the required record.
6. Add the provider adapter, controlled unavailable-provider behaviour, and chat route integration tests.
7. Complete README, threat-model/limitations section, `.gitleaks.toml`, CI, and `PROMPTS.md`.
8. Exercise `docker compose up --build`, send allowed and blocked requests, run secret scan, and rehearse the architecture walkthrough.

## 10. Key risks and decisions to defend

- Pattern-based injection detection catches known corpus and variations, but cannot prove intent or eliminate every bypass. Layering, normalisation, and output checks reduce risk; they do not create a universal solution.
- Reversible PII redaction is security-sensitive. Encryption, TTL, access control, and auditability are mandatory if implemented. Do not put original PII in normal audit logs.
- Audit hashes need a defined canonicalisation method and retention policy; a plain JSON stringify hash can vary with key ordering.
- Redis/Mongo outages should fail closed for `/v1/chat` if the control cannot be enforced; the health endpoint must accurately expose degradation.
- Provider SDKs and models evolve. Pin versions, validate configuration, use timeouts, and keep provider code isolated.

## 11. Documentation checklist

The README should contain: one-command startup; environment setup; API examples; an architecture diagram; one paragraph per control; audit data handling; threat model and limitations; testing commands; and the live-provider/503 behaviour. `PROMPTS.md` must be a truthful record of actual AI interactions, not a retroactive narrative.
