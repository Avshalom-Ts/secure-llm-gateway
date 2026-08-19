import { normalizeText } from "./validation.ts";
import type { ThreatCode } from "../types.ts";

const patterns: Array<[ThreatCode, RegExp]> = [
  [
    "INSTRUCTION_OVERRIDE",
    /(?:ignore|disregard|forget|override) (?:all |any |the )?(?:previous|prior|system|developer) (?:instructions?|prompt)|(?:ignore|disregard) (?:the )?(?:summary|request)|(?:from this message forward|from now on).*(?:bypass|without applying|no restrictions)/,
  ],
  [
    "PROMPT_EXFILTRATION",
    /(?:reveal|show|print|give|tell|repeat|extract|output) (?:me )?(?:the )?(?:system prompt|hidden instructions?|initial instructions?|api keys?|credentials?|internal context|secret)|(?:initial instructions?|system instructions?).*(?:repeat|verbatim|reveal)|(?:print|output) everything in this conversation|(?:environment variables?|configuration values?|api keys?)/,
  ],
  [
    "CONTROL_TOKEN_ATTACK",
    /(?:<\|(?:im_start|im_end|system|assistant|user)\|>|\[\/?(?:system|assistant|user)\]|\[admin\]|###\s*(?:system|assistant|user)|\[end user message\]|system_override|begin (?:system )?prompt|end (?:system )?prompt)|(?:you are now (?:dan|a python repl)|forget you are an llm|bypass all safety|switched to debug mode)/,
  ],
];

/**
 * Normalizes text and detects configured prompt-injection threat patterns.
 * @param content Message content to inspect.
 * @returns Threat codes matched in the normalized content.
 */
export function detectInjection(content: string): ThreatCode[] {
  const normalized = normalizeText(content);
  return patterns.filter(([, pattern]) => pattern.test(normalized)).map(([code]) => code);
}
