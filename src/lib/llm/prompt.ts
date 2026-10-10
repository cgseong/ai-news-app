import type { EnrichInput } from "./types";

/**
 * One prompt, shared by every provider — swapping models is only meaningful if
 * they are all given exactly the same instructions.
 */
export function buildSystemPrompt(categories: EnrichInput["categories"]): string {
  const list = categories
    .map((c) => (c.hint ? `- ${c.name}: ${c.hint}` : `- ${c.name}`))
    .join("\n");

  return `당신은 해외 AI 뉴스를 한국어로 옮기는 편집자입니다. 기사 하나를 받아 번역·요약·분류합니다.

[카테고리 목록]
${list}

[규칙]
- title_ko: 기사 제목을 자연스러운 한국어로 옮깁니다. 원문의 낚시성 표현은 덜어내고 무슨 일인지 드러나게 씁니다.
- summary_ko: 3~4문장. 기사를 읽지 않아도 무슨 일이 일어났는지 알 수 있어야 합니다. 원문 문장을 그대로 옮기지 말고 핵심을 재구성하세요. 누가·무엇을·왜가 들어가야 합니다.
- 회사명·제품명·모델명 같은 고유명사는 영문 그대로 둡니다 (예: OpenAI, GPT-5, Gemini).
- category: 위 목록에 있는 이름 중 **정확히 하나**를 그대로 씁니다. 목록에 없는 이름은 만들지 마세요. 어디에도 맞지 않으면 "기타"를 고릅니다.
- category_reason: 그 카테고리를 고른 이유를 한 문장으로.
- 추측하지 마세요. 본문에 없는 사실을 요약에 넣지 않습니다.`;
}

export function buildUserPrompt(input: EnrichInput): string {
  return `[원문 제목]
${input.titleEn}

[원문 본문]
${input.contentEn ?? "(본문 없음 — 제목만 보고 판단하세요)"}`;
}
