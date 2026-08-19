export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "PROMPT_INJECTION_DETECTED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_ERROR"
  | "UNSAFE_PROVIDER_OUTPUT"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export class GatewayError extends Error {
  /**
   * Creates a typed error that can be translated into an HTTP gateway response.
   * @param code Stable gateway error code exposed to API clients.
   * @param status HTTP status associated with the error.
   * @param message Safe human-readable error message.
   * @param retryAfterSeconds Optional retry delay for rate-limited responses.
   * @returns A configured GatewayError instance.
   */
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

/**
 * Converts a gateway error into the public response body without exposing
 * internal implementation details.
 * @param error Gateway error to serialize.
 * @param correlationId Request identifier used for support and audit tracing.
 * @returns The standardized API error response object.
 */
export function errorBody(error: GatewayError, correlationId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      correlationId,
    },
  };
}
