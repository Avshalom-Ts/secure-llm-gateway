import type { RequestHandler } from "express";

import { GatewayError } from "../errors.ts";

/**
 * Allows only authenticated requests whose key has the administrator role.
 * @param request Express request containing optional authentication context.
 * @param _response Express response, unused by this middleware.
 * @param next Callback used to continue or report an authorization failure.
 * @returns Nothing; it advances the middleware chain or passes an error to it.
 */
export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (request.auth?.role !== "admin") {
    next(new GatewayError("FORBIDDEN", 403, "Administrator access is required."));
    return;
  }

  next();
};
