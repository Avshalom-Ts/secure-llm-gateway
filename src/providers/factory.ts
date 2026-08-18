import { AnthropicProvider } from "./anthropic.ts";
import { OpenAiProvider } from "./openai.ts";
import type { Provider } from "./types.ts";

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
