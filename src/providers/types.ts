import type { ProviderRequest, ProviderResponse } from "../types.ts";

export interface Provider {
  complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse>;
}

export class ProviderError extends Error {
  constructor(
    public readonly kind: "unavailable" | "timeout" | "failure",
    message = "The provider request could not be completed.",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
