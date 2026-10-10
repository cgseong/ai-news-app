import { eq } from "drizzle-orm";

import { db } from "@/db";
import { articles, categories } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";

async function loadCategory(id: number) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  return row;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireUserId())) return unauthorized();

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return failure("Invalid category id", 400);

  try {
    const category = await loadCategory(id);
    if (!category) return failure("Category not found", 404);

    const body = (await request.json()) as {
      name?: string;
      hint?: string | null;
      sortOrder?: number;
    };

    const name = body.name?.trim();
    if (category.isFallback && name && name !== category.name) {
      return failure("기타 카테고리는 이름을 바꿀 수 없습니다.", 400);
    }

    const [updated] = await db
      .update(categories)
      .set({
        ...(name ? { name } : {}),
        ...(body.hint !== undefined ? { hint: body.hint?.trim() || null } : {}),
        ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {}),
      })
      .where(eq(categories.id, id))
      .returning();

    return Response.json(updated);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireUserId())) return unauthorized();

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return failure("Invalid category id", 400);

  try {
    const category = await loadCategory(id);
    if (!category) return failure("Category not found", 404);
    if (category.isFallback) {
      return failure("기타 카테고리는 삭제할 수 없습니다.", 400);
    }

    const [fallback] = await db
      .select()
      .from(categories)
      .where(eq(categories.isFallback, true));

    // Articles outlive their category: they move to 기타 rather than losing it.
    const moved = await db
      .update(articles)
      .set({ categoryId: fallback?.id ?? null })
      .where(eq(articles.categoryId, id))
      .returning({ id: articles.id });

    await db.delete(categories).where(eq(categories.id, id));

    return Response.json({ deleted: id, movedToFallback: moved.length });
  } catch (error) {
    return failure(error);
  }
}
