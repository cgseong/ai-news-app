import { asc, count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { articles, categories } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";

export async function GET() {
  if (!(await requireUserId())) return unauthorized();

  try {
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

    return Response.json({ categories: rows, totalArticles: total?.total ?? 0 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  if (!(await requireUserId())) return unauthorized();

  try {
    const body = (await request.json()) as { name?: string; hint?: string | null };
    const name = body.name?.trim();
    if (!name) return failure("Category name is required", 400);

    const [max] = await db
      .select({ value: sql<number>`coalesce(max(${categories.sortOrder}), 0)` })
      .from(categories);

    const [created] = await db
      .insert(categories)
      .values({
        name,
        hint: body.hint?.trim() || null,
        sortOrder: (max?.value ?? 0) + 1,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
