# Product Definition

## Vision

SecureLLM Gateway is the organization-wide security boundary for application calls to external large language model (LLM) providers. It enables internal teams to adopt LLM features quickly while enforcing consistent access control, data protection, output safety, and auditability.

## Users and Problem

Internal application teams need to call OpenAI or Anthropic models, but implementing security controls independently in every application creates inconsistent protection and weak auditability. Security and platform engineers need one enforceable, observable control point for LLM traffic in a regulated environment.

The gateway sits between trusted internal callers, untrusted user-supplied prompts, and untrusted model output. It must prevent known unsafe requests and responses without exposing raw secrets or personal data in logs.

## Value Proposition

- One integration surface for approved LLM calls rather than duplicated provider integrations.
- Uniform API-key authentication, role-based access, per-key rate limits, and auditable security decisions.
- PII tokenisation before a request leaves the organization and output validation before a response reaches an application.
- A small, testable TypeScript service that remains operationally honest when a dependency or provider is unavailable.

## Scope

### In scope

- `POST /v1/chat` for authenticated chat requests to one configured live provider (OpenAI or Anthropic).
- `GET /v1/audit` for administrator-only, bounded audit-log retrieval.
- `GET /healthz` reporting MongoDB, Redis, and provider-configuration readiness.
- Hashed API keys with `client` and `admin` roles.
- Per-key Redis sliding-window rate limiting, defaulting to 30 requests per minute and supporting a per-key override.
- Prompt-injection detection for role override, prompt or data exfiltration, and delimiter/control-token attacks.
- Inbound redaction of email addresses, Israeli and international phone numbers, and checksum-valid Israeli national IDs.
- Outbound blocking of secret-shaped values, JWT-shaped strings, AWS access keys, and detected injection echoes.
- MongoDB audit records for allowed, blocked, and error outcomes.
- Strict TypeScript, unit tests for every security control, Docker Compose, and secret-scan configuration.
- An AI-agent activity record in the repository-root `PROMPTS.md`. Each completed agent run records the user prompt, agent/tool identity, start and end time (with timezone), outcome, and the repository-relative files it created, modified, or deleted; a no-change run is recorded explicitly.

### Out of scope for the first delivery

- Streaming, tool/function calls, file uploads, multimodal inputs, and provider-side conversation storage.
- A graphical user interface, tenant billing, quotas beyond the requested per-key rate limit, and a general-purpose DLP platform.
- A claim that pattern-based prompt-injection detection prevents all prompt injection.
- A production detokenisation interface unless it is implemented with encryption, access control, expiry, and an audit trail.

## Success Metrics

- All challenge-required security-control unit tests pass, including adversarial variations.
- Every gateway request results in an audit outcome of `allowed`, `blocked`, or `error` without storing raw keys, prompt text, PII, or provider output in the standard audit log.
- A request with a missing provider key returns a clear `503` from `/v1/chat`; the service and `/healthz` still start.
- `docker compose up --build` starts the service, MongoDB, and Redis with no manual infrastructure setup.
- The implementation catches every supplied challenge corpus case once that corpus is available. The current seven-page brief references Appendix A but does not include it, so this remains a validation dependency rather than a completed claim.

## Constraints and Assumptions

- Required stack: TypeScript with `strict: true`, Node.js, Express, MongoDB, Redis, and Vitest preferred.
- Provider credentials and encryption material are supplied only through environment variables; they never appear in source, commits, normal logs, or audit records.
- `PROMPTS.md` is an honest development record, not an agent-generated reconstruction. Prompts are appended from observed input, with secrets, credentials, and production data redacted before writing; the record must never invent tools, times, prompts, or file changes.
- MongoDB and Redis are security dependencies. If their required control cannot run, chat traffic must fail closed and health must report degradation.
- The gateway integrates a real provider when configured; it does not substitute a fake provider in production behavior.
- Detection is a layered, corpus-driven control, not a semantic guarantee. Normalisation and narrow patterns reduce obvious bypasses but require ongoing maintenance.
- The challenge is time-boxed. Security-sensitive capabilities that cannot be safely completed must be documented as limitations, not represented as delivered.

## Change Log

| Date | Change |
| --- | --- |
| 2026-08-17 | Replaced starter content with the SecureLLM Gateway product definition derived from the challenge brief and current implementation plan. |
| 2026-08-17 | Added AI-agent prompt and file-change traceability as an explicit project requirement. |
