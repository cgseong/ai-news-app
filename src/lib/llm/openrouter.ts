import OpenAI from "openai";

import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import {
  type EnrichInput,
  type EnrichResult,
  enrichJsonSchema,
  enrichSchema,
  type LlmProvider,
  LlmNotConfiguredError,
  parseLooseJson,
} from "./types";

const BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-opus-5-5";

export function createOpenRouterProvider(): LlmProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new LlmNotConfiguredError(
      "OPENROUTER_API_KEY is not set (LLM_PROVIDER=openrouter).",
    );
  }

  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;

  // OpenRouter speaks the OpenAI wire format, so the OpenAI SDK works with the
  // base URL swapped. The two extra headers are what attributes usage to this
  // app in the OpenRouter dashboard.
  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "AI News Collector",
    },
  });

  async function complete(input: EnrichInput, withSchema: boolean): Promise<string> {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 8000,
      messages: [
        { role: "system", content: buildSystemPrompt(input.categories) },
        {
          role: "user",
          content: withSchema
            ? buildUserPrompt(input)
            : `${buildUserPrompt(input)}\n\n[출력 형식]\n아래 키를 가진 JSON 객체 하나만 출력하세요. 설명이나 코드펜스 없이 JSON만.\n{"title_ko": "...", "summary_ko": "...", "category": "...", "category_reason": "..."}`,
        },
      ],
      ...(withSchema
        ? {
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: "article_enrichment",
                strict: true,
                schema: enrichJsonSchema,
              },
            },
          }
        : {}),
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned an empty completion");
    }
    return content;
  }

  return {
    id: `openrouter:${model}`,
    async enrich(input: EnrichInput): Promise<EnrichResult> {
      let raw: string;
      try {
        raw = await complete(input, true);
      } catch (error) {
        // json_schema support varies per model on OpenRouter; fall back to
        // asking for JSON in the prompt rather than failing the article.
        if (error instanceof OpenAI.APIError && error.status === 400) {
          raw = await complete(input, false);
        } else {
          throw error;
        }
      }

      return enrichSchema.parse(parseLooseJson(raw));
    },
  };
}
