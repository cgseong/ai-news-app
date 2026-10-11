import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ArticleGrid } from "@/components/ArticleGrid";
import { CategoryBar } from "@/components/CategoryBar";
import { ARTICLE_PAGE_SIZE, listArticles, listCategories } from "@/lib/queries";

export const metadata: Metadata = {
  title: "대시보드 · AI 뉴스 수집기",
};

/**
 * Server-rendered card feed, newest first. The reads are uncached request-time
 * queries, so with cacheComponents they have to sit behind <Suspense>; the
 * heading and the skeleton below are what gets prerendered.
 */
export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI 뉴스</h1>
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
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

  const shown = categoryId
    ? (meta.categories.find((category) => category.id === categoryId)?.articleCount ?? 0)
    : meta.totalArticles;

  return (
    <>
      <p className="mt-1.5 text-sm text-muted">{shown}건 보관 중</p>

      <div className="mt-7 flex flex-col gap-7">
        <CategoryBar
          categories={meta.categories}
          totalArticles={meta.totalArticles}
          selected={categoryId}
        />

        {feed.articles.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted">
            {categoryId
              ? "이 카테고리에는 아직 기사가 없습니다."
              : "아직 기사가 없습니다. 피드에서 '뉴스 가져오기'를 눌러보세요."}
          </p>
        ) : (
          <ArticleGrid articles={feed.articles} />
        )}

        {feed.nextOffset !== null && (
          <Link
            href={moreHref(categoryId, limit + ARTICLE_PAGE_SIZE)}
            className="mx-auto rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent"
          >
            더 보기
          </Link>
        )}
      </div>
    </>
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
    <>
      <div className="skeleton mt-2 h-4 w-24" />

      <div className="mt-7 flex flex-col gap-7">
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
    </>
  );
}
