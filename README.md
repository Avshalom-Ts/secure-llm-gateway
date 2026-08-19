# Secure LLM Gateway

Secure LLM Gateway is a TypeScript/Express service that provides one controlled path from internal applications to OpenAI or Anthropic. It authenticates API keys, enforces per-key Redis rate limits, screens inbound prompts, tokenizes supported PII before provider calls, validates untrusted provider output, and stores sanitized MongoDB audit metadata.

## Local development

Requirements: Bun, Node-compatible native dependencies for Argon2, and Docker Desktop for local MongoDB and Redis services.

```powershell
Copy-Item .env.example .env
docker compose up -d mongodb redis
bun install --frozen-lockfile
bun run dev
```

The local server listens on `http://localhost:3000`. With provider credentials absent, the service still starts and `/v1/chat` returns a controlled `503`; `/healthz` reports provider readiness without exposing credentials.

## Environment

| Variable            | Purpose                             |
| ------------------- | ----------------------------------- |
| `PORT`              | HTTP port, default `3000`           |
| `MONGODB_URI`       | MongoDB connection string           |
| `REDIS_URL`         | Redis connection string             |
| `LLM_PROVIDER`      | `openai` or `anthropic`             |
| `OPENAI_API_KEY`    | Runtime-only OpenAI credential      |
| `ANTHROPIC_API_KEY` | Runtime-only Anthropic credential   |
| `LOG_LEVEL`         | `debug`, `info`, `warn`, or `error` |

Never commit `.env`, provider credentials, raw API keys, prompts, PII, or provider output.

## Endpoints

`GET /healthz` is unauthenticated and reports liveness, provider configuration, and dependency readiness.

`POST /v1/chat` requires `x-api-key` and accepts:

```json
{
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "Hello" }],
  "max_tokens": 1024
}
```

`GET /v1/audit?since=<ISO-8601>&limit=<1..500>` requires an admin API key.

## Security architecture

Authentication parses `skg_<keyId>_<secret>` keys, looks up only the public key ID, and verifies the secret against an Argon2 hash. Authenticated context contains the key ID, role, and server-side rate-limit override; clients cannot provide those values in a request.

Rate limiting uses an atomic Redis sorted-set sliding window. The default is 30 requests per minute, with an optional trusted per-key override loaded from MongoDB. Redis failures fail closed for protected requests.

Inbound prompt-injection detection normalizes text and checks typed patterns for instruction overrides, exfiltration, and control-token attacks. Matching requests are rejected before provider invocation and audited by metadata only.

PII redaction tokenizes email addresses, Israeli and international phone numbers, and checksum-valid Israeli national IDs. Tokens are request-scoped and repeated values reuse a token. The first release does not provide reversible detokenization; raw values are not sent to providers or written to ordinary audit records.

Provider output is treated as untrusted. The gateway blocks OpenAI-style secrets, JWT-shaped strings, AWS access-key IDs, and echoes of detected injection patterns before returning a response.

Audit records contain timestamps, correlation IDs, key IDs, models, hashes, threat codes, token counts, latency, status, and stable reasons. MongoDB write failures are surfaced as dependency errors rather than reported as successful audit writes.

## Testing the gateway

### Fast local checks

These checks use fakes and do not require Docker, MongoDB, Redis, or provider credentials:

```powershell
bun run test
bun run type-check
bun run lint
```

The unit suite covers authentication, admin authorization, rate limiting, request validation, normalization, prompt-injection detection, PII tokenization, provider output validation, hashing, audit behavior, and composed route behavior.

The mandatory corpus at `tests/security/mandatory-adversarial-test-corpus.json` is executed by the unit suite. It currently covers all 12 injection entries, their echoed-output checks, and all 3 PII entries.

### Start the full stack

The submission path is one command. A `.env` file is optional:

```powershell
docker compose up -d
```

Check all services:

```powershell
docker compose ps
docker compose logs gateway
```

Expected services are `gateway`, `mongodb`, and `redis`, all eventually showing `healthy`. MongoDB creates the `secure_llm_gateway` database, `apiKeys` and `auditLogs` collections, and their indexes automatically when the data volume is new.

### Check health and dependencies

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz
docker compose exec redis redis-cli ping
docker compose exec mongodb mongosh --quiet --eval "const d=db.getSiblingDB('secure_llm_gateway'); printjson({collections:d.getCollectionNames(), ping:d.runCommand({ping:1}).ok, apiKeysIndexes:d.apiKeys.getIndexes().length, auditIndexes:d.auditLogs.getIndexes().length})"
```

Without a provider key, `/healthz` should return HTTP `200`, MongoDB and Redis should report `ok`, and the overall status should be `degraded` because provider readiness is false. This is expected and allows the gateway to start safely.

### Create a local API key

After the gateway container is running, create an API-key record inside MongoDB with the trusted seed script. Run it with `bun run` directly against the script file, since the container's Bun runtime does not use `tsx`:

```powershell
docker compose exec gateway bun run src/scripts/seedApiKey.ts --key-id local-client --role client --rate-limit 30
```

For an admin key:

```powershell
docker compose exec gateway bun run src/scripts/seedApiKey.ts --key-id local-admin --role admin --rate-limit 100
```

The command is idempotent by `keyId`: rerunning it replaces that key's hash and configuration. It stores only the Argon2 hash in MongoDB and prints the raw `skg_<keyId>_<secret>` value once. Keep the printed value for the request tests; it cannot be recovered from MongoDB.

### Test protected endpoints

Protected endpoints require a valid API key in this format:

```text
skg_<keyId>_<secret>
```

The seed command above creates a real key for Docker smoke testing. Invalid-key handling can also be tested without a seeded key:

### Testing Chat endpoint

#### Windows

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Method Post `
  -Uri http://localhost:3000/v1/chat `
  -ContentType application/json `
  -Headers @{ "x-api-key" = "invalid" } `
  -Body '{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}'
```

#### Linux/Mac

```bash
curl -X POST http://localhost:3000/v1/chat \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: invalid' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}'
```

The expected result is a sanitized `401` response. When no provider key is configured, a valid authenticated chat request reaches the pipeline and returns a controlled `503` for provider unavailability.

### Optional clean database initialization test

Only use this when local MongoDB data can be deleted. It verifies the first-start init script:

```powershell
docker compose down -v
docker compose up -d
docker compose ps
```

`docker compose down -v` deletes the local MongoDB volume and all data in it.

### Additional release checks

```powershell
bun run test:integration
bun run test:coverage
bun run format:check
bun run scan:secrets
```

`bun run test:integration` requires the running Docker MongoDB and Redis services. The current integration suite verifies real MongoDB API-key persistence and real Redis sliding-window enforcement. The current coverage run reports 87.15% statements and 86.97% lines. `gitleaks` must be installed separately for `bun run scan:secrets`; the verified environment used Gitleaks 8.30.1 and found no leaks. Shutdown checks should be performed before release.

## Verification

Docker Compose startup and gateway `/healthz` smoke verification have passed. MongoDB and Redis integration tests, coverage, `bun audit`, Gitleaks, Dockerfile validation, and SIGTERM shutdown verification have also passed in the current environment. MongoDB and Redis can still run locally during development.

## Limitations

The service intentionally excludes streaming, tool/function calling, file uploads, server-side conversation storage, billing, UI features, and full semantic DLP. Pattern-based injection detection is not a proof of intent and cannot guarantee detection of every novel attack. PII recovery is deferred because a reversible vault requires separate encryption, TTL, access control, and audited administrative workflows.

See [docs/secure-llm-gateway.md](docs/secure-llm-gateway.md) for the detailed design and [.plan/001-implementation-plan.md](.plan/001-implementation-plan.md) for implementation status.

## Project structure

- `src/` - application code, security controls, providers, repositories, and routes
- `tests/` - unit tests and the versioned adversarial corpus
- `docs/` - detailed product and security requirements
- `.plan/` - implementation plan and phase status
- `PROMPTS.md` - truthful AI interaction record required by the challenge
- `.gitleaks.toml` - secret-scan configuration
