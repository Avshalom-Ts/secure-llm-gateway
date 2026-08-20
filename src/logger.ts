import pino from "pino";

import type { AppConfig } from "./config.ts";

/**
 * Creates the process-wide structured logger, defaulting to the configured
 * log level so operators can control verbosity without code changes.
 * @param config Optional application configuration providing the log level.
 * @returns A pino logger instance used for all service-level log lines.
 */
export function createLogger(config?: Pick<AppConfig, "logLevel">) {
  return pino({ level: config?.logLevel ?? "info" });
}

export const logger = createLogger();
