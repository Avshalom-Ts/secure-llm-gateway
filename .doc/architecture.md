# Architecture

## Context

SecureLLM Gateway is an Express service that provides the only approved path from internal applications to an external LLM provider. It must handle trusted application credentials, untrusted inbound prompts, untrusted model output, and regulated-data constraints. The service is designed as a small, modular TypeScript application so each security control can be tested in isolation.

The initial release selects one live provider through configuration (`openai` or `anthropic`) while keeping provider-specific code behind a shared adapter. MongoDB stores API-key metadata and audit records; Redis enforces the per-key sliding-window limit.

## Components

| Component | Responsibility |
| --- | --- |
| Express application | Composes middleware, routes, request-size limits, a correlation ID, and the error boundary. |
| Authentication middleware | Parses `x-api-key`, finds the internal key record, verifies its slow hash, and attaches only the internal key identity, role, and limit override to request context. |
| Authorization middleware | Restricts `/v1/audit` to the `admin` role. |
| Rate-limit middleware | Uses an atomic Redis sorted-set operation or Lua script to enforce a 60-second sliding window per immutable API-key ID. |
| Request validator | Enforces the chat schema: approved model, supported roles, non-empty bounded messages, and bounded `max_tokens`. |
| Injection detector | Normalises inbound content and returns typed threat codes for role override, data exfiltration, and delimiter/control-token patterns. |
| PII redactor and token vault | Replaces supported PII with opaque, request-scoped tokens before provider invocation. Reversibility, if delivered, is isolated in an encrypted, access-controlled TTL-backed vault. |
| Provider adapter | Converts a validated, redacted request into the configured OpenAI or Anthropic API call with timeout and typed failure handling. |
| Output validator | Blocks provider output that contains secret patterns or echoes a detected injection; it never returns blocked output to the caller. |
| Audit service and repository | Writes minimally sensitive audit metadata for every allowed, blocked, and error outcome. |
| Health route | Reports liveness plus MongoDB, Redis, and provider configuration/readiness without returning credentials or connection strings. |
| AI-agent activity recorder | Appends factual AI-agent run entries to repository-root `PROMPTS.md`, including the user prompt, timing, result, and detected workspace file changes. |

## Data and Request Flow

```text
Internal application
  | POST /v1/chat + x-api-key
  v
Express: correlation ID and bounded request parsing
  -> authenticate API key and attach key ID / role
  -> apply per-key Redis sliding-window limit
  -> validate chat schema
  -> inspect every message for prompt injection
  -> redact supported PII into opaque tokens
  -> call the configured live LLM provider
  -> validate untrusted provider output
  -> persist a minimal MongoDB audit record
  v
Sanitised response, or a controlled error / block response
```

The route layer coordinates these steps but does not contain security regexes, provider request construction, MongoDB queries, or Redis commands. Every terminal path records an audit outcome where the service has enough context to do so. A blocked injection is audited and never sent to a provider; a blocked output is audited and never returned to the client.

## AI-Agent Activity Record

`PROMPTS.md` is the durable, human-reviewable record required by the challenge. The agent orchestration layer must create one entry after each agent run, whether the run changed files or not. The writer appends observed facts only and must redact credentials, secrets, and production data from prompts or summaries before persisting them.

Each entry has this stable structure:

```md
## Agent run: <run-id>

- Agent/tool: <observed agent or tool name>
- Started: <ISO-8601 timestamp with timezone>
- Finished: <ISO-8601 timestamp with timezone>
- User prompt: <verbatim prompt, redacted only for secrets or production data>
- Outcome: <completed | failed | cancelled>
- Files changed: <repository-relative paths and action: added, modified, deleted; or `None`>
- Notes: <short factual summary, without fabricated claims>
```

The recorder captures the file set by comparing the repository worktree immediately before and after the agent run, including untracked files. It reports paths relative to the repository root and distinguishes `added`, `modified`, and `deleted` where the version-control state permits. It must not infer a file change from an agent's text response alone. The initial historical transcript stays intact; future entries are appended rather than rewriting past activity.

### HTTP contract

| Endpoint | Authentication | Behaviour |
| --- | --- | --- |
| `POST /v1/chat` | `client` or `admin` API key | Runs the full security pipeline and proxies to the selected provider. |
| `GET /v1/audit?since=<ISO-8601>&limit=<1..500>` | `admin` API key | Returns bounded, sanitised audit entries since the supplied timestamp. |
| `GET /healthz` | None | Reports service liveness and component/provider readiness. |

Error responses use a stable shape such as `{ error: { code, message, correlationId } }`. Expected status codes include `401` for unauthenticated requests, `403` for role violations, `400` for invalid or injected input, `429` for rate limits, `422` for unsafe provider output, `502`/`503` for provider failures, and a clear `503` when no provider key is configured.

## Data Model

### MongoDB

`apiKeys` stores `keyId`, a slow `secretHash`, `role`, optional `rateLimitPerMinute`, `active`, and timestamps. `keyId` is unique and is the only key identifier propagated beyond authentication.

`auditLogs` stores a timestamp, correlation ID, internal API-key ID, model, SHA-256 request and response hashes, typed detected threats, PII-token count, latency, status (`allowed`, `blocked`, or `error`), and a stable non-sensitive reason code where needed. It does not store raw messages, PII, keys, provider credentials, or raw provider output. Required indexes are a unique index on `apiKeys.keyId`, `auditLogs.timestamp`, and `{ apiKeyId, timestamp }`.

If reversible PII processing is implemented, originals belong only in a separate encrypted token-vault collection with a TTL index and explicit audited administrative access. The standard audit record must not become that vault.

### Redis

Rate-limit entries use a key such as `rate:{apiKeyId}` and timestamps as sorted-set scores. The check removes entries older than 60 seconds, counts current entries, conditionally adds the new entry, and sets a short expiry atomically.

## Security Boundaries and Failure Behaviour

- Raw API keys enter only in the request header, are verified against a stored hash, and are not logged.
- Original supported PII is replaced before the provider call and is absent from normal logs and audit records.
- Provider output is treated as untrusted even when the request was allowed.
- MongoDB or Redis failures that make a required control unavailable cause `/v1/chat` to fail closed; `/healthz` reports the dependency state.
- Missing provider configuration does not prevent startup, but `/v1/chat` returns `503` and health reports the provider as not ready.
- Secret scanning and environment-only credentials protect source control; structured logging must redact credentials, PII, and provider payloads.
- The AI-agent activity recorder writes only to `PROMPTS.md`, uses observed timestamps and worktree state, and redacts sensitive prompt material before append. A recorder failure must be visible to the operator and must not be silently represented as a successful record.

## External Dependencies

| Dependency | Purpose | Operational expectation |
| --- | --- | --- |
| OpenAI or Anthropic API | Live model completion for the selected provider | API key from environment; timeout and controlled error mapping. |
| MongoDB | API-key metadata and minimal audit persistence | Reachability checked by health endpoint; required for protected traffic. |
| Redis | Atomic, per-key sliding-window rate limiting | Reachability checked by health endpoint; required for protected traffic. |
| Docker and Docker Compose | Local reproducible service, MongoDB, and Redis startup | `docker compose up --build` starts the complete development stack. |
| Gitleaks or equivalent | Secret scanning in local/CI workflow | Narrow allow-listing only for intentional test fixtures. |

## Change Log

| Date | Change |
| --- | --- |
| 2026-08-17 | Replaced starter content with the proposed SecureLLM Gateway architecture. |
| 2026-08-17 | Defined the `PROMPTS.md` AI-agent activity-record contract. |
