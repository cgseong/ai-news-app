"use client";

import { useState } from "react";

import { ArticleCard } from "@/components/ArticleCard";
import { CategoryTabs, FeedToolbar } from "@/components/FeedChrome";
import type { FeedArticle } from "@/lib/types";

/**
 * Design preview. Renders the real feed components against fixtures so the
 * layout can be looked at without a database, a login or an LLM key.
 * Delete this route once the design is settled.
 */

/** A flat two-tone cover, inlined so the preview needs no network. */
function cover(from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="640" height="360" fill="url(#g)"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CATEGORIES = [
  { id: 1, name: "모델·연구", articleCount: 12 },
  { id: 2, name: "제품·서비스", articleCount: 9 },
  { id: 3, name: "산업·투자", articleCount: 7 },
  { id: 4, name: "정책·규제", articleCount: 4 },
  { id: 5, name: "기타", articleCount: 2 },
];

const ARTICLES: FeedArticle[] = [
  {
    id: 1,
    url: "https://www.theverge.com/",
    source: "theverge",
    titleEn: "OpenAI opens its newest reasoning model to developers",
    titleKo: "오픈AI, 최신 추론 모델을 개발자에게 공개",
    summaryKo:
      "오픈AI가 장문 추론에 특화된 신규 모델을 API로 열었다. 기존 모델 대비 수학·코드 벤치마크에서 두 자릿수 개선을 보였고, 가격은 토큰당 소폭 인상됐다. 회사는 에이전트 워크로드를 겨냥한 캐싱 옵션도 함께 내놨다.",
    imageUrl: cover("#2563eb", "#7c3aed"),
    publishedAt: "2026-10-10T09:12:00.000Z",
    status: "enriched",
    error: null,
    notionPageId: null,
    categoryId: 1,
    categoryName: "모델·연구",
  },
  {
    id: 2,
    url: "https://techcrunch.com/",
    source: "techcrunch",
    titleEn: "Anthropic raises at a $380B valuation",
    titleKo: "앤스로픽, 3,800억 달러 밸류에이션으로 신규 투자 유치",
    summaryKo:
      "앤스로픽이 기업용 수요 급증을 근거로 대규모 라운드를 마감했다. 조달 자금은 추론 인프라 확충과 엔터프라이즈 영업 조직 확대에 쓰일 예정이다.",
    imageUrl: null,
    publishedAt: "2026-10-10T06:40:00.000Z",
    status: "enriched",
    error: null,
    notionPageId: "1f2a3b4c5d6e7f8091a2b3c4d5e6f708",
    categoryId: 3,
    categoryName: "산업·투자",
  },
  {
    id: 3,
    url: "https://www.theverge.com/",
    source: "theverge",
    titleEn: "EU regulators set a deadline for AI model disclosures",
    titleKo: "EU, AI 모델 정보 공개 의무 시한 확정",
    summaryKo:
      "EU 집행위가 범용 AI 모델 제공자에게 학습 데이터 요약과 안전성 평가 결과를 제출하도록 하는 시행 일정을 발표했다. 미제출 시 전 세계 매출 기준 과징금이 부과된다.",
    imageUrl: cover("#0ea5e9", "#2563eb"),
    publishedAt: "2026-10-09T17:05:00.000Z",
    status: "enriched",
    error: null,
    notionPageId: null,
    categoryId: 4,
    categoryName: "정책·규제",
  },
  {
    id: 4,
    url: "https://techcrunch.com/",
    source: "techcrunch",
    titleEn: "Google brings agentic browsing to Chrome for everyone",
    titleKo: "구글, 크롬 전면에 에이전트 브라우징 기능 적용",
    summaryKo:
      "구글이 제한적으로 시험하던 에이전트 브라우징을 전체 사용자로 확대한다. 사용자가 맡긴 작업을 탭 단위로 수행하며, 결제·로그인 단계에서는 확인을 요구한다.",
    imageUrl: null,
    publishedAt: "2026-10-09T13:22:00.000Z",
    status: "enriched",
    error: null,
    notionPageId: null,
    categoryId: 2,
    categoryName: "제품·서비스",
  },
  {
    id: 5,
    url: "https://www.theverge.com/",
    source: "theverge",
    titleEn: "Chip supply crunch pushes inference prices up again",
    titleKo: null,
    summaryKo: null,
    imageUrl: null,
    publishedAt: "2026-10-09T11:00:00.000Z",
    status: "pending",
    error: null,
    notionPageId: null,
    categoryId: null,
    categoryName: null,
  },
  {
    id: 6,
    url: "https://techcrunch.com/",
    source: "techcrunch",
    titleEn: "A startup says it can run 70B models on a single consumer GPU",
    titleKo: "소비자용 GPU 한 장으로 70B 모델을 돌린다는 스타트업",
    summaryKo: null,
    imageUrl: cover("#6366f1", "#2563eb"),
    publishedAt: "2026-10-08T20:30:00.000Z",
    status: "failed",
    error: "LLM 응답을 JSON으로 해석하지 못했습니다.",
    notionPageId: null,
    categoryId: 5,
    categoryName: "기타",
  },
];

export default function PreviewPage() {
  const [selected, setSelected] = useState<number | null>(null);

  const articles =
    selected === null ? ARTICLES : ARTICLES.filter((a) => a.categoryId === selected);

  return (
    <div className="flex flex-col gap-7">
      <p className="rounded-xl border border-dashed border-border px-4 py-2.5 text-xs text-muted">
        디자인 미리보기 — 샘플 데이터입니다. 버튼은 동작하지 않습니다.
      </p>

      <FeedToolbar subtitle="34건 보관 중" collecting={false} onCollect={() => {}} />

      <CategoryTabs
        categories={CATEGORIES}
        totalArticles={34}
        selected={selected}
        onSelect={setSelected}
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} onRetry={() => {}} />
        ))}
      </div>
    </div>
  );
}
