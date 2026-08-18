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

## Verification

```powershell
bun run test
bun run type-check
bun run lint
bun run format:check
bun run scan:secrets
```

Docker Compose build and gateway smoke verification are deferred to the final release step. MongoDB and Redis can still run locally during development.

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
