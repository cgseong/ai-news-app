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
const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

/**
 * Statuses that mean "this route would not take the schema", as opposed to
 * "the request itself is wrong". 400 bad params, 404 no endpoint matches as
 * routed, 422 the upstream rejected the schema, 503 nothing satisfies the
 * routing requirements — which is what `require_parameters` returns when no
 * provider supports json_schema. Key and credit errors (401/402/403) are real
 * failures, and 408/409/429/5xx were already retried by the SDK.
 *
 * Connection and timeout errors carry no status, so they land outside this set
 * and rethrow — a request that already burned its whole timeout must not buy a
 * second one on the way out.
 */
const SCHEMA_ROUTING_STATUSES = new Set([400, 404, 422, 503]);

/**
 * OpenRouter extends the OpenAI request body with its own keys. The SDK sends
 * unknown properties through untouched; typing the variable rather than the
 * call-site literal is what gets past the excess-property check. (`@ts-expect-error`
 * would break the build later, as "unused", if the SDK ever types `provider`.)
 */
type OpenRouterChatParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  provider?: { require_parameters?: boolean };
};

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
    // The SDK defaults to ten minutes — longer than the whole `after()` budget
    // the enrichment pass runs inside, so one hung article could eat all of it.
    // Non-streaming plus always-on thinking means nothing arrives until the
    // answer is complete, so don't go much below this.
    timeout: 60_000,
    // The default, stated rather than inherited: it multiplies with the timeout
    // above and so belongs to the budget calculation. Covers 408/409/429/5xx.
    maxRetries: 2,
    defaultHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "AI News Collector",
    },
  });

  async function complete(input: EnrichInput, withSchema: boolean): Promise<string> {
    const params: OpenRouterChatParams = {
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
            // Without this, `response_format` is only a *preference*: OpenRouter
            // routes to a supporting endpoint if one exists, and otherwise drops
            // the parameter and lets the model answer in prose. Several
            // endpoints of the default model (Bedrock, Claude on AWS) do not
            // support structured outputs, so make the mismatch an error we can
            // detect instead of a silent fall-through to unparseable text.
            provider: { require_parameters: true },
            response_format: {
              type: "json_schema" as const,
              json_schema: {
                name: "article_enrichment",
                strict: true,
                schema: enrichJsonSchema,
              },
            },
          }
        : // No `provider` pin on the second attempt: it has to be free to route
          // anywhere, since asking for JSON in the prompt is all it relies on.
          {}),
    };

    const response = await client.chat.completions.create(params);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned an empty completion");
    }
    return content;
  }

  async function attempt(input: EnrichInput, withSchema: boolean): Promise<EnrichResult> {
    return enrichSchema.parse(parseLooseJson(await complete(input, withSchema)));
  }

  return {
    id: `openrouter:${model}`,
    async enrich(input: EnrichInput): Promise<EnrichResult> {
      try {
        return await attempt(input, true);
      } catch (error) {
        // Two ways the schema path fails and is still worth a prompt-mode retry:
        // the route refused json_schema (an API status), or a provider ignored
        // it and wrote prose (JSON.parse or zod threw — no status at all).
        // Anything else is a real failure and must surface as itself.
        if (error instanceof OpenAI.APIError && !SCHEMA_ROUTING_STATUSES.has(error.status ?? 0)) {
          throw error;
        }
        return attempt(input, false);
      }
    },
  };
}
