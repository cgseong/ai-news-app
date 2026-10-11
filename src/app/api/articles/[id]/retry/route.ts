import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { articles } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";
import { enrichPending } from "@/lib/collect";

/**
 * `enrichPending()` drains the whole pending queue, not just this article, so
 * this route needs the same `after()` budget as a collect. See the constant in
 * `api/collect/route.ts`.
 */
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireUserId())) return unauthorized();

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return failure("Invalid article id", 400);

  try {
    await db
      .update(articles)
      .set({ status: "pending", error: null })
      .where(eq(articles.id, id));

    after(async () => {
      await enrichPending();
    });

    return Response.json({ queued: true });
  } catch (error) {
    return failure(error);
  }
}
