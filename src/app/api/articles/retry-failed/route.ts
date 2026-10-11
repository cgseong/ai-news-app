import { eq } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db";
import { articles } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";
import { enrichPending } from "@/lib/collect";

/**
 * Phase 2 runs inside `after()`, which gets the route's max duration — see the
 * same constant in `api/collect/route.ts`. Re-queueing everything that failed
 * makes this the longest pass of the three.
 */
export const maxDuration = 300;

/** Settings screen: re-queue everything that failed to summarise. */
export async function POST() {
  if (!(await requireUserId())) return unauthorized();

  try {
    const requeued = await db
      .update(articles)
      .set({ status: "pending", error: null })
      .where(eq(articles.status, "failed"))
      .returning({ id: articles.id });

    after(async () => {
      await enrichPending();
    });

    return Response.json({ requeued: requeued.length });
  } catch (error) {
    return failure(error);
  }
}
