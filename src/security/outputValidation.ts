import { detectInjection } from "./injection.ts";
import type { ThreatCode } from "../types.ts";

const outputPatterns: Array<[ThreatCode, RegExp]> = [
  ["SECRET_IN_OUTPUT", /\bsk-[A-Za-z0-9_-]{16,}\b/],
  ["JWT_IN_OUTPUT", /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ["AWS_KEY_IN_OUTPUT", /\bAKIA[0-9A-Z]{16}\b/],
];

export function validateProviderOutput(
  content: string,
  inboundThreats: ThreatCode[] = [],
): ThreatCode[] {
  const threats = outputPatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([code]) => code);
  const normalizedOutput = content.toLowerCase();
  const hasInjectionEcho = inboundThreats.some((threat) =>
    detectInjection(normalizedOutput).includes(threat),
  );

  if (hasInjectionEcho) {
    threats.push("INJECTION_ECHO");
  }

  return [...new Set(threats)];
}
