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

export function errorBody(error: GatewayError, correlationId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      correlationId,
    },
  };
}
