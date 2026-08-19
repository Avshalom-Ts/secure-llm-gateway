# Plan: Reshape `PROMPTS.md` and finish submission prep

## Goal

Bring `PROMPTS.md` and the rest of the submission into compliance with the challenge brief's Section 4 (AI Process Requirements) and Section 5 (Deliverables), without inventing or reordering any interaction that did not actually happen.

## Constraints

- `PROMPTS.md` stays a truthful record. Reshaping means indexing/organizing the existing transcript, not rewriting history.
- The first prompt recorded must remain word-for-word identical to what was actually sent, since the defense session opens by cross-checking it.
- Do not remove the raw transcript; the brief penalizes evasive or generic `PROMPTS.md` files, and a summary-only file would look evasive.

## Steps

- [x] Add a "Submission summary" section near the top of `PROMPTS.md` that maps the existing transcript to the six required points (tools used, why multiple tools, three example prompts, rejected output, future work, first interaction verbatim).
- [x] Append the 2026-08-19 continuation prompts (README fix, submission-readiness follow-through, CI workflow, the two clarification questions about the exposed key and the one-command/no-secrets tension) to the transcript.
- [x] Copied the full original transcript to `ALL_PROMPTS.md` (user action), then reshaped `PROMPTS.md` itself into the six required sections as its primary content, with `ALL_PROMPTS.md` kept as the complete unedited backing record.
- [ ] Re-read `PROMPTS.md` end to end once more and confirm every quoted prompt matches `ALL_PROMPTS.md` exactly (no paraphrasing drift).
- [ ] Decide whether to keep `docs/SUBMISSION_READINESS.md` in the repo as-is, or fold its remaining checklist into `.plan/001-implementation-plan.md` only and trim the doc to a short pointer — avoid two diverging copies of the same checklist.
- [ ] Walk through the six PDF-required `PROMPTS.md` points once more, out loud, as a dry run for the defense session's opening question ("walk us through your first interaction with an AI tool").
- [ ] Re-run `bun run scan:secrets` and `docker compose up -d` one final time immediately before publishing, since both are one-shot gates that must be true at submission time, not just at some earlier point in the session.
- [ ] Rotate the OpenAI key that was read into this chat session (user action; not performed by tooling) before or shortly after submission.
- [ ] Confirm the repository visibility/share settings match "public or share-linked GitHub repository" from Section 5.

## Exit gate

`PROMPTS.md` contains, in one readable pass: an honest tool list, a real multi-tool moment on shared files, three verbatim prompts (generation/security/debugging) with outcomes, one rejected-output example, two credible future-work items, and the verbatim first prompt — all traceable to the transcript beneath it.
