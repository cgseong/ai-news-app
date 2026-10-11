import { createAnthropicProvider } from "./anthropic";
import { createOpenRouterProvider } from "./openrouter";
import { type LlmProvider, LlmNotConfiguredError } from "./types";

export { LlmNotConfiguredError };
export type { EnrichResult, LlmProvider } from "./types";

/**
 * The only place that decides which vendor a summary goes to. Everything else
 * calls `provider.enrich()` and never learns the difference (PRD §5 F2.1).
 */
export function getLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase() || "openrouter";

  switch (provider) {
    case "anthropic":
      return createAnthropicProvider();
    case "openrouter":
      return createOpenRouterProvider();
    default:
      throw new LlmNotConfiguredError(
        `Unknown LLM_PROVIDER "${provider}". Use "anthropic" or "openrouter".`,
      );
  }
}
