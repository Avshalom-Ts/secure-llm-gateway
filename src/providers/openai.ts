import OpenAI from "openai";

import type { ProviderRequest, ProviderResponse } from "../types.ts";
import { ProviderError, type Provider } from "./types.ts";

export class OpenAiProvider implements Provider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

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
