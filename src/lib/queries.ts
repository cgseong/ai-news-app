/**
 * The two reads the feed and the dashboard share. Route handlers and server
 * components both go through here so the card list is built one way only.
 */

import { asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { articles, categories } from "@/db/schema";
import type { CategoryRow, FeedArticle } from "@/lib/types";

export const ARTICLE_PAGE_SIZE = 30;

/** Enough to fill the card's three summary lines, and not a byte more. */
const EXCERPT_CHARS = 300;

/**
 * Newest first. `published_at` is nullable (some feed items carry no date), so
 * those rows sort last and `id` breaks ties — two items published in the same
 * minute keep a stable order across pages.
 */
export async function listArticles({
  categoryId = null,
  offset = 0,
  limit = ARTICLE_PAGE_SIZE,
}: {
  categoryId?: number | null;
  offset?: number;
  limit?: number;
} = {}): Promise<{ articles: FeedArticle[]; nextOffset: number | null }> {
  const rows = await db
    .select({
      id: articles.id,
      url: articles.url,
      source: articles.source,
      titleEn: articles.titleEn,
      titleKo: articles.titleKo,
      summaryKo: articles.summaryKo,
      // Stand-in summary until the LLM step lands: the opening of the feed
      // body. Sliced in SQL so the 8KB content_en never reaches the client.
      excerptEn: sql<string | null>`left(${articles.contentEn}, ${sql.raw(String(EXCERPT_CHARS))})`,
      imageUrl: articles.imageUrl,
      publishedAt: articles.publishedAt,
      status: articles.status,
      error: articles.error,
      notionPageId: articles.notionPageId,
      categoryId: articles.categoryId,
      categoryName: categories.name,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(categoryId ? eq(articles.categoryId, categoryId) : undefined)
    .orderBy(sql`${articles.publishedAt} desc nulls last`, desc(articles.id))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;

  return {
    articles: rows.slice(0, limit).map((row) => ({
      ...row,
      // Dates cross to client components as ISO strings, the same shape the
      // API routes hand over after JSON serialization.
      publishedAt: row.publishedAt?.toISOString() ?? null,
    })),
    nextOffset: hasMore ? offset + limit : null,
  };
}

/**
 * Just the number for the toolbar's status line. Its own small query, so the
 * button and the heading can render before the card list has been read.
 */
export async function countArticles(categoryId: number | null = null): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(articles)
    .where(categoryId ? eq(articles.categoryId, categoryId) : undefined);

  return row?.total ?? 0;
}

/** Categories in display order, each with the number of articles filed under it. */
export async function listCategories(): Promise<{
  categories: CategoryRow[];
  totalArticles: number;
}> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      hint: categories.hint,
      sortOrder: categories.sortOrder,
      isFallback: categories.isFallback,
      articleCount: count(articles.id),
    })
    .from(categories)
    .leftJoin(articles, eq(articles.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.id));

  const [total] = await db.select({ total: count() }).from(articles);

  return { categories: rows, totalArticles: total?.total ?? 0 };
}
