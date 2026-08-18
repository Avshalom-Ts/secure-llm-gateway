import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  MONGODB_URI: z.string().url().default("mongodb://localhost:27017/secure_llm_gateway"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  ANTHROPIC_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional()),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = {
  environment: "development" | "test" | "production";
  port: number;
  mongodbUri: string;
  redisUrl: string;
  llmProvider: "openai" | "anthropic";
  providerConfigured: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
};

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);
  const providerConfigured =
    parsed.LLM_PROVIDER === "openai"
      ? Boolean(parsed.OPENAI_API_KEY)
      : Boolean(parsed.ANTHROPIC_API_KEY);

  return {
    environment: parsed.NODE_ENV,
    port: parsed.PORT,
    mongodbUri: parsed.MONGODB_URI,
    redisUrl: parsed.REDIS_URL,
    llmProvider: parsed.LLM_PROVIDER,
    providerConfigured,
    logLevel: parsed.LOG_LEVEL,
  };
}
