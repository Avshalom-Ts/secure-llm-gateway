# Secure LLM Gateway Implementation Plan

## Decisions and Scope

- Implement the gateway as a TypeScript/Node.js Express service.
- Use Bun as the JavaScript runtime, package manager, script runner, and test command runner; commit the generated `bun.lock` file.
- Support both OpenAI and Anthropic through a provider-neutral adapter interface.
- Use token-only PII redaction for the first release. Encrypted reversible recovery is deferred, but the service boundary should leave room for a future token vault.
- Treat Redis as enforcement-critical. Protected requests are rejected when rate limiting cannot be guaranteed.
- Keep health diagnostics available during dependency failures without exposing credentials or connection strings.
- Define MongoDB audit failure behavior explicitly; never claim an audit was written when it was not.
- Keep streaming, tool/function calling, file uploads, multi-turn storage, UI, billing, and full DLP out of scope.
- Obtain the missing challenge Appendix A corpus. Until then, maintain a versioned internal adversarial test corpus.

## Target Request Lifecycle

1. Create a correlation ID and start a latency timer.
2. Authenticate the `x-api-key` header and attach key context.
3. Enforce the Redis sliding-window rate limit.
4. Validate and size-limit the request body.
5. Detect prompt injection.
6. Tokenize supported PII before sending content to a provider.
7. Call the selected OpenAI or Anthropic adapter.
8. Validate the provider output for secrets and injection echoes.
9. Persist sanitized audit metadata.
10. Return only the approved response.

## Implementation Phases

### Phase 0: Confirm Contracts

- Record decisions for correlation ID format, audit retention, PII token lifetime, rate-limit charging, provider selection, `max_tokens` policy, and dependency failure behavior.
- Define endpoint schemas, response shapes, status codes, request size limits, and message limits for:
  - `POST /v1/chat`
  - `GET /v1/audit?since=<ISO-8601>&limit=<1..500>`
  - `GET /healthz`
- Confirm the missing Appendix A input and identify the replacement point in the test corpus.

Commands:

```powershell
git status --short
git log --oneline -5
rg -n "TODO|Appendix|reversible|rate|healthz|v1/chat|v1/audit" docs README.md PROMPTS.md
```

Exit gate: requirements and unresolved decisions are recorded in `docs/secure-llm-gateway.md` or a linked design note.

### Phase 1: Bootstrap the Service

- Create the Bun/TypeScript project with strict compiler settings.
- Add Express, Zod, MongoDB, Redis, Argon2id or bcrypt, OpenAI, Anthropic, Vitest, ESLint, and Prettier.
- Add `src/app.ts`, `src/server.ts`, and `src/config.ts`.
- Define package scripts for `dev`, `build`, `start`, `type-check`, `lint`, unit/integration tests, coverage, security tests, and secret scanning; invoke them with `bun run`.
- Commit `bun.lock` after dependency installation and use frozen-lockfile installation in CI.
- Add `.env.example`, `.gitignore`, Dockerfile, and Docker Compose for the gateway, MongoDB, and Redis.
- Establish dependency-injection boundaries so routes can use fakes in unit tests.

Commands:

```powershell
bun init
bun add express zod mongodb redis argon2 openai @anthropic-ai/sdk
bun add --dev typescript tsx vitest @types/node @types/express eslint prettier
bunx tsc --init
docker compose up -d mongodb redis
bun run type-check
bun run lint
```

Exit gate: the app starts with validated configuration, the test runner executes, and `/healthz` has a basic liveness response.

### Phase 2: Configuration, Types, and Errors

- Validate environment variables at startup.
- Define roles, threat codes, provider errors, audit statuses, correlation IDs, and API response types.
- Add centralized error handling with generic client messages.
- Ensure logs contain only safe metadata such as correlation ID, key ID, status, and reason.

Commands:

```powershell
bun run type-check
bun run test -- config error-handler
bun run lint
```

### Phase 3: Authentication and Authorization

- Parse keys in the form `skg_<keyId>_<secret>`.
- Look up keys by ID and verify the secret hash with Argon2id or bcrypt.
- Reject missing, malformed, inactive, and invalid keys with safe `401` responses.
- Enforce admin-only audit access with `403` responses for authenticated non-admin clients.
- Add a unique MongoDB index for API key IDs.
- Add a safe local-development key seeding mechanism that never stores raw secrets.

Commands:

```powershell
bun run test:unit -- authenticate authorise apiKeyRepository
bun run type-check
bun run lint
```

Exit gate: valid client and admin keys receive the expected context, and raw key secrets do not appear in logs or persistence.

### Phase 4: Redis Rate Limiting

- Implement a per-key sliding-window limit using Redis sorted sets.
- Use an atomic Lua script or equivalent transaction for cleanup, counting, insertion, and expiry.
- Support the default 30 requests per minute and per-key overrides.
- Return `429` with safe retry information when the limit is exceeded.
- Reject protected requests with a safe dependency error when Redis is unavailable.

Commands:

```powershell
bun run test:unit -- rateLimit redisRateLimiter
docker compose exec redis redis-cli ping
bun run test:integration -- rate-limit
```

### Phase 5: Request Validation and Normalization

- Use Zod to validate chat payloads, messages, models, generation controls, and audit query parameters.
- Enforce body-size, message-count, and content limits before expensive processing.
- Normalize Unicode, whitespace, casing, zero-width characters, and supported leetspeak variants.

Commands:

```powershell
bun run test:unit -- validation normalization
bun run type-check
bun run lint
```

### Phase 6: Inbound Security Controls

- Implement typed prompt-injection detection for:
  - instruction and role overrides
  - exfiltration requests
  - delimiter and control-token attacks
- Implement PII tokenization for:
  - email addresses
  - Israeli and international phone numbers
  - Israeli national IDs with checksum validation
- Reuse one token for repeated values in a request.
- Keep token maps request-scoped and send tokens, not raw PII, to providers.
- Add positive, negative, and false-positive cases to a versioned adversarial corpus.

Commands:

```powershell
bun run test:unit -- injection pii
bun run test:security
bun run test:coverage -- security
bun run lint
```

Exit gate: security modules are independently testable and raw PII does not enter provider requests or audit records.

### Phase 7: Provider Adapters

- Define a provider-neutral non-streaming chat completion interface.
- Implement OpenAI and Anthropic adapters.
- Normalize provider responses and safe error categories.
- Add request timeouts and cancellation.
- Ensure credentials never appear in errors or logs.
- Use fake providers for default tests; make live-provider tests explicitly credential-gated.

Commands:

```powershell
bun run test:unit -- providers
bun run test:integration -- providers
bun run type-check
bun run build
```

### Phase 8: Output Validation and Audit

- Detect and block output containing:
  - OpenAI-style API keys
  - JWT-like strings
  - AWS access-key IDs
  - normalized prompt-injection echoes
- Hash request and response content with SHA-256.
- Persist only sanitized audit metadata:
  - timestamp
  - correlation ID
  - API key ID
  - model
  - request and response hashes
  - detected threat codes
  - PII token count
  - latency
  - status and safe reason
- Add MongoDB indexes for timestamp and API-key/time queries.
- Test MongoDB outage behavior without silently claiming that an audit was written.

Commands:

```powershell
bun run test:unit -- outputValidation hashing audit
docker compose exec mongodb mongosh --eval "db.adminCommand({ ping: 1 })"
bun run test:integration -- audit
```

### Phase 9: Route Composition

- Wire the complete request lifecycle in the documented order.
- Implement `POST /v1/chat`.
- Implement admin-only `GET /v1/audit` with ISO-8601 `since` and `1..500` `limit` validation.
- Implement unauthenticated `GET /healthz` with safe liveness, dependency, and provider readiness information.
- Cover authentication, rate-limit, validation, injection, provider, output, and dependency failure paths.

Commands:

```powershell
bun run test:unit
bun run test:integration
bun run build
bun run start
curl -i http://localhost:3000/healthz
curl -i -X POST http://localhost:3000/v1/chat -H "x-api-key: invalid" -H "content-type: application/json" -d "{}"
```

Exit gate: all public endpoints have stable, documented status codes and sanitized responses.

### Phase 10: Quality and Security Hardening

- Add integration tests against Docker Compose MongoDB and Redis.
- Test rate-limit concurrency and dependency failures.
- Test malformed keys, large payloads, PII formats, normalization, provider errors, unsafe output, and audit sanitization.
- Add regression tests for every discovered defect.
- Update `README.md`, `docs/README.md`, and `docs/secure-llm-gateway.md` with setup, API examples, environment variables, limitations, and operations.

Commands:

```powershell
bun run test
bun run test:coverage
bun run type-check
bun run lint
bun audit
bun run scan:secrets
```

### Phase 11: Container and Release Verification

- Harden the production image with a minimal runtime, non-root user, healthcheck, and correct signal handling.
- Ensure credentials are injected at runtime and are absent from image layers.
- Add CI for install, lint, type-check, unit tests, integration tests, coverage, dependency auditing, and secret scanning.
- Verify startup, shutdown, health, provider configuration, sanitized logs, and dependency failure modes.

Commands:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs gateway
curl -fsS http://localhost:3000/healthz
docker build --check -t secure-llm-gateway:local .
docker compose down -v
```

## Final Release Gate

Run the complete local verification sequence:

```powershell
bun install --frozen-lockfile
docker compose up -d mongodb redis
bun run lint
bun run type-check
bun run test:coverage
bun run test:integration
bun audit
bun run scan:secrets
```

Then manually verify:

- unauthenticated, malformed, inactive, and valid API keys
- client versus admin authorization
- successful fake-provider chat flow
- prompt-injection blocking
- PII tokenization and repeated-value token reuse
- unsafe output blocking
- rate-limit exhaustion and Redis outage behavior
- audit retrieval and MongoDB outage behavior
- absence of raw prompts, PII, keys, credentials, and unsafe output in logs and MongoDB
- non-root container execution and graceful shutdown

The implementation is complete when all automated checks pass, both provider adapters satisfy the same contract, the security controls are covered by adversarial tests, and the documented non-goals remain unimplemented.

## Project References

- `AGENTS.md` — repository security and documentation rules.
- `PROMPTS.md` — required AI interaction record.
- `docs/secure-llm-gateway.md` — authoritative product and security requirements.
- `agents/backend/README.md` — backend responsibilities.
- `agents/orchestrator/README.md` — coordination responsibilities.
- `agents/qa/README.md` — verification responsibilities.
- `agents/frontend/README.md` — frontend scope, currently outside the gateway MVP.
