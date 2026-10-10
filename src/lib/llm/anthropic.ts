import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import {
  type EnrichInput,
  type EnrichResult,
  enrichSchema,
  type LlmProvider,
  LlmNotConfiguredError,
} from "./types";

const DEFAULT_MODEL = "claude-opus-5-5";

export function createAnthropicProvider(): LlmProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LlmNotConfiguredError(
      "ANTHROPIC_API_KEY is not set (LLM_PROVIDER=anthropic).",
    );
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  return {
    id: `anthropic:${model}`,
    async enrich(input: EnrichInput): Promise<EnrichResult> {
      const message = await client.messages.parse({
        model,
        // Thinking is always on for the Opus/Sonnet 5 family and is billed against
        // max_tokens, so leave headroom; effort stays low for a task this routine.
        max_tokens: 8000,
        output_config: {
          effort: "low",
          format: zodOutputFormat(enrichSchema),
        },
        system: buildSystemPrompt(input.categories),
        messages: [{ role: "user", content: buildUserPrompt(input) }],
      });

      if (message.stop_reason === "refusal") {
        throw new Error("Model declined to process this article");
      }
      if (!message.parsed_output) {
        throw new Error(`Model returned no parseable output (stop: ${message.stop_reason})`);
      }

      return message.parsed_output;
    },
  };
}
