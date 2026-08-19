import Anthropic from "@anthropic-ai/sdk";

import type { ProviderRequest, ProviderResponse } from "../types.ts";
import { ProviderError, type Provider } from "./types.ts";

export class AnthropicProvider implements Provider {
  private readonly client: Anthropic;

  /**
   * Creates an Anthropic client adapter using the supplied credential.
   * @param apiKey Anthropic API key used for provider requests.
   * @returns A configured AnthropicProvider instance.
   */
  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Sends a normalized chat request to Anthropic and converts its response to
   * the gateway provider contract.
   * @param request Model, messages, and generation settings to send.
   * @param signal Optional abort signal for cancelling the provider request.
   * @returns The provider response content and model name.
   * @throws ProviderError when the provider times out, fails, or returns no text.
   */
  async complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    try {
      const systemMessage = request.messages.find((message) => message.role === "system")?.content;
      const messages = request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
          role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: message.content,
        }));
      const response = await this.client.messages.create(
        {
          model: request.model as "claude-3-5-sonnet",
          system: systemMessage,
          messages,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature,
        },
        { signal },
      );
      const content = response.content.find((block) => block.type === "text");
      if (!content || content.type !== "text") {
        throw new ProviderError("failure");
      }
      return { content: content.text, model: response.model };
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new ProviderError("timeout");
      }
      throw new ProviderError("failure");
    }
  }
}
