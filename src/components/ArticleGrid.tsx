"use client";

import { useRouter } from "next/navigation";

import { ArticleCard } from "@/components/ArticleCard";
import type { FeedArticle } from "@/lib/types";

/**
 * The card grid for a server-rendered list. ArticleCard needs a retry handler,
 * which has to live on the client; everything else arrives already queried.
 */
export function ArticleGrid({ articles }: { articles: FeedArticle[] }) {
  const router = useRouter();

  async function retry(id: number) {
    await fetch(`/api/articles/${id}/retry`, { method: "POST" });
    // Enrichment runs after the response, so this only flips the card back to
    // 요약 중; the summary shows up on the next load.
    router.refresh();
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} onRetry={retry} />
      ))}
    </div>
  );
}
