import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ArticleGrid } from "@/components/ArticleGrid";
import { CategoryBar } from "@/components/CategoryBar";
import { CollectBar } from "@/components/CollectBar";
import { LoadMoreLink } from "@/components/LoadMoreLink";
import {
  ARTICLE_PAGE_SIZE,
  countArticles,
  listArticles,
  listCategories,
} from "@/lib/queries";

export const metadata: Metadata = {
  title: "대시보드 · AI 뉴스 수집기",
};

/**
 * Server-rendered card feed, newest first. The reads are uncached request-time
 * queries, so with cacheComponents they have to sit behind <Suspense>; the
 * toolbar and the skeleton below are what gets prerendered.
 *
 * The status line is its own boundary with its own small count query, so the
 * collect button belongs to the static shell and can be pressed while the card
 * list is still being read.
 */
export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className="flex flex-col gap-7">
      <CollectBar
        subtitle={
          <Suspense fallback={<div className="skeleton mt-2 h-4 w-24" />}>
            <ArticleCount searchParams={searchParams} />
          </Suspense>
        }
      />

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ArticleCount({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  const params = await searchParams;
  const total = await countArticles(toPositiveInt(params.category));

  return <p className="mt-1.5 text-sm text-muted">{total}건 보관 중</p>;
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  const params = await searchParams;

  const categoryId = toPositiveInt(params.category);
  // "더 보기" widens the window instead of paging, so earlier cards stay put.
  const limit = Math.min(
    Math.max(toPositiveInt(params.take) ?? ARTICLE_PAGE_SIZE, ARTICLE_PAGE_SIZE),
    300,
  );

  const [feed, meta] = await Promise.all([
    listArticles({ categoryId, limit }),
    listCategories(),
  ]);

  return (
    <div className="flex flex-col gap-7">
      <CategoryBar
        categories={meta.categories}
        totalArticles={meta.totalArticles}
        selected={categoryId}
      />

      {feed.articles.length === 0 ? (
        <EmptyState filtered={categoryId !== null} />
      ) : (
        <ArticleGrid articles={feed.articles} />
      )}

      {feed.nextOffset !== null && (
        <LoadMoreLink href={moreHref(categoryId, limit + ARTICLE_PAGE_SIZE)} />
      )}
    </div>
  );
}

/**
 * Two ways to be empty, and neither should be a dead end: a filter that matches
 * nothing (→ back to the full list) and an empty database (→ the collect button
 * right above, which needs no categories and no LLM key).
 */
function EmptyState({ filtered }: { filtered: boolean }) {
  const { title, hint, action } = filtered
    ? {
        title: "이 카테고리에는 아직 기사가 없습니다.",
        hint: "다른 카테고리를 보거나 전체 목록으로 돌아가세요.",
        action: { href: "/dashboard", label: "전체 보기" },
      }
    : {
        title: "아직 기사가 없습니다.",
        hint: "위의 '뉴스 가져오기'를 누르면 최근 24시간 안에 올라온 기사를 수집합니다.",
        action: null,
      };

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted">{hint}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-3 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

function toPositiveInt(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function moreHref(categoryId: number | null, take: number) {
  const params = new URLSearchParams();
  if (categoryId) params.set("category", String(categoryId));
  params.set("take", String(take));
  return `/dashboard?${params}`;
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap gap-2">
        {[...Array(5)].map((_, index) => (
          <div key={index} className="skeleton h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, index) => (
          <div
            key={index}
            className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]"
          >
            <div className="skeleton aspect-[16/9] w-full rounded-none" />
            <div className="flex flex-col gap-3 p-5">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-3.5 w-11/12" />
              <div className="skeleton h-3.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
