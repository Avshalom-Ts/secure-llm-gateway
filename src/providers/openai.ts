import OpenAI from "openai";

import type { ProviderRequest, ProviderResponse } from "../types.ts";
import { ProviderError, type Provider } from "./types.ts";

export class OpenAiProvider implements Provider {
  private readonly client: OpenAI;

  /**
   * Creates an OpenAI client adapter using the supplied credential.
   * @param apiKey OpenAI API key used for provider requests.
   * @returns A configured OpenAiProvider instance.
   */
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Sends a chat request to OpenAI and converts its first text response to the
   * gateway provider contract.
   * @param request Model, messages, and generation settings to send.
   * @param signal Optional abort signal for cancelling the provider request.
   * @returns The provider response content and model name.
   * @throws ProviderError when the provider times out, fails, or returns no text.
   */
  async complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: request.model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        },
        { signal },
      );
      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new ProviderError("failure");
      }
      return { content, model: response.model };
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
