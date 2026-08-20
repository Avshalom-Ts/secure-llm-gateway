# Plan: Stand-out signal audit (PDF page 7) — 2026-08-20

## Goal

Checked each "what will make your submission stand out" item against the actual repo state:

- [x] **Constant-time API key comparison.** Already satisfied: `authenticate.ts` never does a raw string/byte comparison of secrets — it calls `argon2.verify()`, which performs the hash comparison in constant time internally. No change needed.
- [x] **Working CI step that runs secret-scan and tests on every push.** Already satisfied: `.github/workflows/ci.yml` runs on `push`/`pull_request` to `main` and executes type-check, lint, format check, unit tests, integration tests, then Gitleaks (`bun run scan:secrets`). No change needed.
- [x] **Structured logging (pino or similar) with a correlation ID per request.** Was missing — `app.ts` and `server.ts` used bare `console.*` calls. Implemented: added `pino` dependency, created `src/logger.ts` (`createLogger`, respects `LOG_LEVEL`), and replaced all service-level `console.error`/`console.log` calls in `src/app.ts` and `src/server.ts` with the pino logger. The existing per-request `correlationId` continues to be attached to the error-handler log line. `src/scripts/seedApiKey.ts` keeps `console.log` deliberately — it is an operator-facing CLI print of a one-time secret value, not a service log line.
- [x] **README section on what the service does not protect against.** Was only implicit inside "Limitations." Added a dedicated "What this service does not protect against" section to `README.md` covering novel/obfuscated injections, semantic PII, compromised API keys, malicious provider output, downstream trust, and volumetric DoS.
- [x] **Tests that include adversarial inputs and variations, not just happy paths.** Already satisfied: `tests/security/mandatory-adversarial-test-corpus.json` plus `tests/unit/mandatoryCorpus.test.ts` exercise all 12 injection entries (with echoed-output checks) and all 3 PII entries. No change needed.
- [x] **Explicit description in `PROMPTS.md` of how the PDF was sanitised before consuming it with an AI tool.** Was scattered across `ALL_PROMPTS.md` but not called out explicitly in `PROMPTS.md`. Added a new "0. How the challenge PDF was sanitised before use" section to `PROMPTS.md`, grounded in the existing transcript facts (piecemeal reading, missing Appendix A noted rather than assumed absent, mandatory corpus supplied and treated as untrusted test data, not instructions).
- [x] Verified `bun run type-check`, `bun run lint`, and `bun run test:unit` all still pass after the logging refactor (9 files, 55 tests).

## Exit gate

`PROMPTS.md` contains, in one readable pass: an honest tool list, a real multi-tool moment on shared files, three verbatim prompts (generation/security/debugging) with outcomes, one rejected-output example, two credible future-work items, and the verbatim first prompt — all traceable to the transcript beneath it.
