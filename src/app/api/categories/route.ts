import { sql } from "drizzle-orm";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";
import { listCategories } from "@/lib/queries";

export async function GET() {
  if (!(await requireUserId())) return unauthorized();

  try {
    return Response.json(await listCategories());
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
