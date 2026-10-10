import { z } from "zod";

export const enrichSchema = z.object({
  title_ko: z.string().describe("기사 제목의 한국어 번역"),
  summary_ko: z.string().describe("기사 핵심 내용 3~4문장 한국어 요약"),
  category: z.string().describe("주어진 카테고리 목록 중 정확히 하나의 이름"),
  category_reason: z.string().describe("그 카테고리를 고른 이유 한 줄"),
});

export type EnrichResult = z.infer<typeof enrichSchema>;

/** JSON Schema mirror of `enrichSchema`, for providers that take raw JSON Schema. */
export const enrichJsonSchema = {
  type: "object",
  properties: {
    title_ko: { type: "string", description: "기사 제목의 한국어 번역" },
    summary_ko: { type: "string", description: "기사 핵심 내용 3~4문장 한국어 요약" },
    category: { type: "string", description: "주어진 카테고리 목록 중 정확히 하나의 이름" },
    category_reason: { type: "string", description: "그 카테고리를 고른 이유 한 줄" },
  },
  required: ["title_ko", "summary_ko", "category", "category_reason"],
  additionalProperties: false,
} as const;

export type EnrichInput = {
  titleEn: string;
  contentEn: string | null;
  categories: { name: string; hint: string | null }[];
};

export interface LlmProvider {
  /** Recorded on the article, e.g. "anthropic:claude-opus-5-5". */
  readonly id: string;
  enrich(input: EnrichInput): Promise<EnrichResult>;
}

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

/**
 * Models that ignore a JSON-schema constraint still tend to return JSON wrapped
 * in prose or a code fence. Recover what we can before giving up on the article.
 */
export function parseLooseJson(raw: string): unknown {
  const unfenced = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start === -1 || end <= start) {
      throw new Error("LLM response contained no JSON object");
    }
    return JSON.parse(unfenced.slice(start, end + 1));
  }
}
