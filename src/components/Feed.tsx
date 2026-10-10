"use client";

import { useEffect, useState } from "react";

import { ArticleCard } from "@/components/ArticleCard";
import type { CategoryRow, FeedArticle } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchArticles(categoryId: number | null, offset: number) {
  const params = new URLSearchParams();
  if (categoryId) params.set("category", String(categoryId));
  if (offset) params.set("offset", String(offset));

  const response = await fetch(`/api/articles?${params}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "기사를 불러오지 못했습니다.");
  return body as { articles: FeedArticle[]; nextOffset: number | null };
}

async function fetchCategories() {
  const response = await fetch("/api/categories");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "카테고리를 불러오지 못했습니다.");
  return body as { categories: CategoryRow[]; totalArticles: number };
}

export function Feed() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [totalArticles, setTotalArticles] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumped whenever the feed should be re-read: category switch, collect, poll tick.
  const [reloadToken, setReloadToken] = useState(0);
  // Bumped to (re)start the pending-count poller.
  const [pollNonce, setPollNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [feed, meta] = await Promise.all([
          fetchArticles(selected, 0),
          fetchCategories(),
        ]);
        if (cancelled) return;
        setArticles(feed.articles);
        setNextOffset(feed.nextOffset);
        setCategories(meta.categories);
        setTotalArticles(meta.totalArticles);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(message(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, reloadToken]);

  /**
   * Phase 2 runs on the server after /api/collect answers, so the feed watches
   * the pending count and re-reads the list until every card has filled in.
   */
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = 0;

    const tick = async () => {
      try {
        const response = await fetch("/api/articles/pending-count");
        if (!response.ok) return;
        const { pending: count } = (await response.json()) as { pending: number };
        if (cancelled) return;

        setPending(count);
        if (count !== previous) {
          previous = count;
          setReloadToken((token) => token + 1);
        }
        if (count > 0) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch {
        // A hiccup while polling shouldn't break the page; the next run recovers.
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pollNonce]);

  async function collect() {
    setCollecting(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch("/api/collect", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "수집에 실패했습니다.");

      setNotice(
        body.inserted > 0
          ? `새 기사 ${body.inserted}건을 가져왔습니다. 요약 중입니다…`
          : "새로운 기사가 없습니다.",
      );
      if (body.errors?.length) {
        setError(body.errors.map((e: { message: string }) => e.message).join(" / "));
      }

      setReloadToken((token) => token + 1);
      setPollNonce((nonce) => nonce + 1);
    } catch (err) {
      setError(message(err));
    } finally {
      setCollecting(false);
    }
  }

  async function retry(id: number) {
    await fetch(`/api/articles/${id}/retry`, { method: "POST" });
    setPollNonce((nonce) => nonce + 1);
  }

  async function loadMore() {
    if (nextOffset === null) return;
    try {
      const feed = await fetchArticles(selected, nextOffset);
      setArticles((prev) => [...prev, ...feed.articles]);
      setNextOffset(feed.nextOffset);
    } catch (err) {
      setError(message(err));
    }
  }

  function selectCategory(categoryId: number | null) {
    if (categoryId === selected) return;
    setLoading(true);
    setSelected(categoryId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI 뉴스</h1>
          <p className="mt-1 text-sm text-muted">
            {pending > 0 ? `${pending}건 요약 중…` : `${totalArticles}건 보관 중`}
          </p>
        </div>
        <button
          type="button"
          onClick={collect}
          disabled={collecting}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {collecting ? "가져오는 중…" : "뉴스 가져오기"}
        </button>
      </div>

      {notice && <p className="text-sm text-accent">{notice}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <nav className="flex flex-wrap gap-2">
        <TabButton
          active={selected === null}
          label="전체"
          count={totalArticles}
          onClick={() => selectCategory(null)}
        />
        {categories.map((category) => (
          <TabButton
            key={category.id}
            active={selected === category.id}
            label={category.name}
            count={category.articleCount}
            onClick={() => selectCategory(category.id)}
          />
        ))}
      </nav>

      {loading && articles.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">불러오는 중…</p>
      ) : articles.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          아직 기사가 없습니다. &apos;뉴스 가져오기&apos;를 눌러보세요.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} onRetry={retry} />
          ))}
        </div>
      )}

      {nextOffset !== null && (
        <button
          type="button"
          onClick={loadMore}
          className="mx-auto rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-muted"
        >
          더 보기
        </button>
      )}
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-border text-muted hover:bg-surface-muted"
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs opacity-70">{count}</span>
    </button>
  );
}
