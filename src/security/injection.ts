import { normalizeText } from "./validation.ts";
import type { ThreatCode } from "../types.ts";

const patterns: Array<[ThreatCode, RegExp]> = [
  ["INSTRUCTION_OVERRIDE", /(?:ignore|disregard|forget|override) (?:all |any |the )?(?:previous|prior|system|developer) (?:instructions?|prompt)/],
  ["PROMPT_EXFILTRATION", /(?:reveal|show|print|give|tell|repeat|extract) (?:me )?(?:the )?(?:system prompt|hidden instructions?|api keys?|credentials?|internal context|secret)/],
  ["CONTROL_TOKEN_ATTACK", /(?:<\|(?:system|assistant|user)\|>|\[\/?(?:system|assistant|user)\]|###\s*(?:system|assistant|user)|begin (?:system )?prompt|end (?:system )?prompt)/],
];

export function detectInjection(content: string): ThreatCode[] {
  const normalized = normalizeText(content);
  return patterns.filter(([, pattern]) => pattern.test(normalized)).map(([code]) => code);
}
