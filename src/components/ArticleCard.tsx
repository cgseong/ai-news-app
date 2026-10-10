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
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
      {children}
    </article>
  );
}

function PendingCard({ article }: { article: FeedArticle }) {
  return (
    <CardShell>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <span className="text-xs text-muted">{SOURCE_LABELS[article.source] ?? article.source}</span>
        <p className="text-sm text-muted">{article.titleEn}</p>
        <div className="mt-2 flex flex-col gap-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-2/3" />
        </div>
        <span className="mt-auto pt-3 text-xs text-muted">요약 중…</span>
      </div>
    </CardShell>
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

  if (article.status === "pending") {
    return <PendingCard article={article} />;
  }

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

  return (
    <CardShell>
      {article.imageUrl && (
        // Article images come from whatever CDN the publisher uses, so next/image
        // remote patterns would be a guessing game.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt=""
          className="aspect-[16/9] w-full object-cover"
          loading="lazy"
        />
      )}

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center gap-2 text-xs text-muted">
          {article.categoryName && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
              {article.categoryName}
            </span>
          )}
          {failed && (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium text-danger">
              요약 실패
            </span>
          )}
          <span>{SOURCE_LABELS[article.source] ?? article.source}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(article.publishedAt)}</span>
        </div>

        <h2 className="text-base leading-snug font-semibold">
          {article.titleKo ?? article.titleEn}
        </h2>

        {failed ? (
          <p className="text-sm text-danger">{article.error ?? "요약에 실패했습니다."}</p>
        ) : (
          <p className="text-sm leading-relaxed text-muted">{article.summaryKo}</p>
        )}

        {saveError && <p className="text-xs text-danger">{saveError}</p>}

        <div className="mt-auto flex items-center gap-2 pt-3">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted"
          >
            원문 보기
          </a>

          {failed ? (
            <button
              type="button"
              onClick={() => onRetry(article.id)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-muted"
            >
              재시도
            </button>
          ) : savedPageId ? (
            <a
              href={notionUrl(savedPageId)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-medium text-muted"
            >
              저장됨 ↗
            </a>
          ) : (
            <button
              type="button"
              onClick={saveToNotion}
              disabled={saving}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "Notion 저장"}
            </button>
          )}
        </div>
      </div>
    </CardShell>
  );
}
