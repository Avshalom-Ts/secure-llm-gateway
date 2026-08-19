import type { ProviderRequest, ProviderResponse } from "../types.ts";

export interface Provider {
  complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse>;
}

export class ProviderError extends Error {
  /**
   * Creates a normalized provider failure with a stable failure category.
   * @param kind Whether the provider was unavailable, timed out, or failed.
   * @param message Safe diagnostic message for internal handling.
   * @returns A configured ProviderError instance.
   */
  constructor(
    public readonly kind: "unavailable" | "timeout" | "failure",
    message = "The provider request could not be completed.",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
