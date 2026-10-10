import { and, desc, eq, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { articles, categories } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";

const PAGE_SIZE = 30;

export async function GET(request: NextRequest) {
  if (!(await requireUserId())) return unauthorized();

  try {
    const params = request.nextUrl.searchParams;
    const categoryId = Number(params.get("category"));
    const offset = Math.max(0, Number(params.get("offset")) || 0);

    const filter = Number.isFinite(categoryId) && categoryId > 0
      ? and(eq(articles.categoryId, categoryId))
      : undefined;

    const rows = await db
      .select({
        id: articles.id,
        url: articles.url,
        source: articles.source,
        titleEn: articles.titleEn,
        titleKo: articles.titleKo,
        summaryKo: articles.summaryKo,
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
      .where(filter)
      .orderBy(sql`${articles.publishedAt} desc nulls last`, desc(articles.id))
      .limit(PAGE_SIZE + 1)
      .offset(offset);

    const hasMore = rows.length > PAGE_SIZE;

    return Response.json({
      articles: rows.slice(0, PAGE_SIZE),
      nextOffset: hasMore ? offset + PAGE_SIZE : null,
    });
  } catch (error) {
    return failure(error);
  }
}
