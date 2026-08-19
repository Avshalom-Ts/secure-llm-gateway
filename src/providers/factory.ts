import { AnthropicProvider } from "./anthropic.ts";
import { OpenAiProvider } from "./openai.ts";
import type { Provider } from "./types.ts";

/**
 * Instantiates the configured provider only when its matching credential exists.
 * @param provider Provider name selected by configuration.
 * @param credentials Optional credentials for the supported providers.
 * @returns A provider adapter, or null when the selected provider is unconfigured.
 */
export function createProvider(
  provider: "openai" | "anthropic",
  credentials: { openaiApiKey?: string; anthropicApiKey?: string },
): Provider | null {
  if (provider === "openai" && credentials.openaiApiKey) {
    return new OpenAiProvider(credentials.openaiApiKey);
  }
  if (provider === "anthropic" && credentials.anthropicApiKey) {
    return new AnthropicProvider(credentials.anthropicApiKey);
  }
  return null;
}
