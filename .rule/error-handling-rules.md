# Error Handling Rules

- Validate input early and return safe, actionable errors.
- Keep implementation details, stack traces, secrets, and provider payloads out of user-facing responses.
- Log unexpected failures with enough context to investigate, while redacting sensitive data.
- Retry only transient failures, with bounded backoff and idempotent operations where possible.
- Add failure-path tests for critical workflows.
