import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { detectInjection } from "../../src/security/injection.ts";
import { tokenizeMessages } from "../../src/security/pii.ts";
import { validateProviderOutput } from "../../src/security/outputValidation.ts";

type CorpusCase = {
  id: string;
  input: string;
  expected: string;
};

type CorpusSection = {
  cases: Array<Record<string, CorpusCase>>;
};

const corpus = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "tests/security/mandatory-adversarial-test-corpus.json"),
    "utf8",
  ),
) as Record<string, CorpusSection>;

const injectionCases = Object.values(corpus)
  .flatMap((section) => section.cases)
  .flatMap((entry) => Object.entries(entry))
  .filter(([id]) => id.startsWith("INJ-"))
  .map(([caseId, value]) => ({ caseId, ...value }));

const piiCases = Object.values(corpus)
  .flatMap((section) => section.cases)
  .flatMap((entry) => Object.entries(entry))
  .filter(([id]) => id.startsWith("PII-"))
  .map(([caseId, value]) => ({ caseId, ...value }));

describe("mandatory adversarial corpus", () => {
  it.each(injectionCases)("blocks $caseId at the inbound detector", ({ input }) => {
    expect(detectInjection(input)).not.toEqual([]);
  });

  it.each(injectionCases)("blocks an echoed $caseId payload at output validation", ({ input }) => {
    const inboundThreats = detectInjection(input);
    expect(validateProviderOutput(input, inboundThreats)).toContain("INJECTION_ECHO");
  });

  it.each(piiCases)("redacts every PII span in $caseId before provider forwarding", ({ input }) => {
    const result = tokenizeMessages([{ role: "user", content: input }]);

    expect(result.piiTokenCount).toBeGreaterThan(0);
    expect(result.messages[0]?.content).not.toContain(input);
    expect(result.messages[0]?.content).toContain("[PII:");
  });
});
