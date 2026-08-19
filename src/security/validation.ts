import { z } from "zod";

import type { ChatRequest } from "../types.ts";

const messageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().trim().min(1).max(16_000),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    model: z.enum(["gpt-4o", "claude-3-5-sonnet"]),
    messages: z.array(messageSchema).min(1).max(50),
    max_tokens: z.number().int().min(1).max(4_096).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict();

export const auditQuerySchema = z
  .object({
    since: z.coerce.date(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

/**
 * Validates an unknown request body against the bounded chat request schema.
 * @param value Untrusted request body to parse.
 * @returns A validated ChatRequest value.
 * @throws ZodError when the body shape or limits are invalid.
 */
export function parseChatRequest(value: unknown): ChatRequest {
  return chatRequestSchema.parse(value);
}

/**
 * Normalizes Unicode, invisible characters, whitespace, casing, and basic leetspeak.
 * @param value Text to normalize before security pattern matching.
 * @returns The normalized lowercase text.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\t\r\n ]+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(
      /[43017@$]/g,
      (character) =>
        ({ "4": "a", "3": "e", "0": "o", "1": "i", "7": "t", "@": "a", $: "s" })[character] ??
        character,
    );
}
