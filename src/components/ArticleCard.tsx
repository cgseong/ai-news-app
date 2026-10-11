"use client";

import { useState } from "react";

import type { FeedArticle } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  techcrunch: "TechCrunch",
  theverge: "The Verge",
};

function formatDate(iso: string | null) {
  if (!iso) return "날짜 미상";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function notionUrl(pageId: string) {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-card-hover)]">
      {children}
    </article>
  );
}

/** Small pill used for the category, the source and the failure marker. */
function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "danger";
}) {
  const tones = {
    neutral: "bg-surface-muted text-muted",
    accent: "bg-accent-soft text-accent",
    danger: "bg-surface-muted text-danger",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Stands in for a thumbnail when the feed carried no image (TechCrunch never does). */
function CoverFallback({ label }: { label: string }) {
  return (
    <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-accent-soft to-surface-muted">
      <span className="text-sm font-semibold tracking-tight text-accent opacity-70">
        {label}
      </span>
    </div>
  );
}

export function ArticleCard({
  article,
  onRetry,
}: {
  article: FeedArticle;
  onRetry: (id: number) => void;
}) {
  const [savedPageId, setSavedPageId] = useState(article.notionPageId);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveToNotion() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/articles/${article.id}/notion`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "저장에 실패했습니다.");
      setSavedPageId(body.notionPageId);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const failed = article.status === "failed";
  const source = SOURCE_LABELS[article.source] ?? article.source;
  // No Korean summary yet (collected but not classified, or the LLM failed):
  // the card shows the start of the original feed body instead of a skeleton,
  // so a collected article is readable with no LLM key in sight.
  const excerpted = !article.summaryKo;

  return (
    <CardShell>
      <div className="relative overflow-hidden">
        {article.imageUrl ? (
          // Article images come from whatever CDN the publisher uses, so next/image
          // remote patterns would be a guessing game.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <CoverFallback label={source} />
        )}

        {article.categoryName && (
          <span className="absolute top-3 left-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-contrast shadow-sm">
            {article.categoryName}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-5">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span className="font-medium text-foreground/70">{source}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(article.publishedAt)}</span>
          {failed ? (
            <span className="ml-auto">
              <Chip tone="danger">요약 실패</Chip>
            </span>
          ) : (
            excerpted && (
              <span className="ml-auto">
                <Chip tone="accent">원문 발췌</Chip>
              </span>
            )
          )}
        </div>

        <h2 className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-tight">
          {article.titleKo ?? article.titleEn}
        </h2>

        {failed ? (
          <p className="line-clamp-3 text-sm text-danger">
            {article.error ?? "요약에 실패했습니다."}
          </p>
        ) : (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted">
            {article.summaryKo ?? article.excerptEn ?? "원문에 본문이 없습니다."}
          </p>
        )}

        {saveError && <p className="text-xs text-danger">{saveError}</p>}

        <div className="mt-auto flex items-center gap-2 pt-4">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            원문 보기
          </a>

          {failed ? (
            <button
              type="button"
              onClick={() => onRetry(article.id)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
            >
              재시도
            </button>
          ) : excerpted ? (
            // Saving now would write a Notion page with an empty summary.
            <span className="ml-auto text-xs text-muted">요약 대기 중</span>
          ) : savedPageId ? (
            <a
              href={notionUrl(savedPageId)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              저장됨 ↗
            </a>
          ) : (
            <button
              type="button"
              onClick={saveToNotion}
              disabled={saving}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              {saving ? "저장 중…" : "Notion 저장"}
            </button>
          )}
        </div>
      </div>
    </CardShell>
  );
}
