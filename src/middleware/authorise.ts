import type { RequestHandler } from "express";

import { GatewayError } from "../errors.ts";

export const requireAdmin: RequestHandler = (request, _response, next) => {
  if (request.auth?.role !== "admin") {
    next(new GatewayError("FORBIDDEN", 403, "Administrator access is required."));
    return;
  }

  next();
};
