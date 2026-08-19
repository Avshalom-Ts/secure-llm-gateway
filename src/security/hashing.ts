import { createHash } from "node:crypto";

/**
 * Recursively converts structured values into a deterministic representation by
 * sorting object keys while preserving array order and date values.
 * @param value Value to canonicalize before hashing.
 * @returns A recursively canonicalized value.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

/**
 * Produces a SHA-256 hex digest for a string or deterministically serialized value.
 * @param value Value whose content should be hashed.
 * @returns The lowercase SHA-256 digest.
 */
export function sha256(value: unknown): string {
  const canonicalValue = typeof value === "string" ? value : JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonicalValue).digest("hex");
}
