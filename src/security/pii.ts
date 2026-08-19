import { createHash } from "node:crypto";

import type { ChatMessage } from "../types.ts";

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern =
  /(?<!\d)(?:(?:\+972|00972)[ -]?(?:[2-9]\d)|0(?:[2-9]\d)|\+1[ -]?\d{3})[ -]?\d{3}[ -]?\d{4}(?!\d)/g;
const nationalIdPattern = /(?<!\d)\d{8,9}(?!\d)/g;

type TokenType = "email" | "phone" | "national-id";

export type TokenizedText = {
  content: string;
  tokenCount: number;
};

/**
 * Validates an 8- or 9-digit value using the Israeli ID checksum algorithm.
 * @param value Candidate national ID value.
 * @returns True when the value has a valid checksum and is not all zeroes.
 */
function validIsraeliId(value: string): boolean {
  const digits = value.padStart(9, "0");
  if (digits.length !== 9 || /^0+$/.test(digits)) {
    return false;
  }

  const checksum = digits.split("").reduce((sum, digit, index) => {
    const product = Number(digit) * (index % 2 === 0 ? 1 : 2);
    return sum + (product > 9 ? product - 9 : product);
  }, 0);
  return checksum % 10 === 0;
}

/**
 * Creates a stable, non-reversible token for a normalized PII value.
 * @param type PII category used in the token label and hash input.
 * @param value Canonical value to tokenize.
 * @returns A deterministic PII replacement token.
 */
function tokenFor(type: TokenType, value: string): string {
  const digest = createHash("sha256").update(`${type}:${value}`).digest("hex").slice(0, 12);
  return `[PII:${type}:${digest}]`;
}

/**
 * Converts supported international phone formats to a stable canonical form.
 * @param value Phone number containing punctuation or an international prefix.
 * @returns Canonical digits, or a plus-prefixed US number where applicable.
 */
function canonicalPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00972")) {
    return `0${digits.slice(5)}`;
  }
  if (digits.startsWith("972")) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith("1") && digits.length === 11) {
    return `+${digits}`;
  }
  return digits;
}

/**
 * Replaces supported PII in chat messages with stable tokens shared across the request.
 * @param messages Chat messages whose content should be redacted before forwarding.
 * @returns Redacted messages and the count of distinct PII tokens created.
 */
export function tokenizeMessages(messages: ChatMessage[]): {
  messages: ChatMessage[];
  piiTokenCount: number;
} {
  const tokens = new Map<string, string>();
  let piiTokenCount = 0;

  const tokenize = (content: string): TokenizedText => {
    const replace = (value: string, type: TokenType, canonicalValue = value) => {
      const key = `${type}:${canonicalValue}`;
      let token = tokens.get(key);
      if (!token) {
        token = tokenFor(type, canonicalValue);
        tokens.set(key, token);
        piiTokenCount += 1;
      }
      return token;
    };

    let tokenized = content.replace(emailPattern, (value) =>
      replace(value, "email", value.toLowerCase()),
    );
    tokenized = tokenized.replace(phonePattern, (value) =>
      replace(value, "phone", canonicalPhone(value)),
    );
    tokenized = tokenized.replace(nationalIdPattern, (value) =>
      validIsraeliId(value) ? replace(value, "national-id", value.padStart(9, "0")) : value,
    );
    return { content: tokenized, tokenCount: piiTokenCount };
  };

  const tokenizedMessages = messages.map((message) => ({
    ...message,
    content: tokenize(message.content).content,
  }));
  return { messages: tokenizedMessages, piiTokenCount };
}
