import { count, eq } from "drizzle-orm";

import { db } from "@/db";
import { articles } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";

/** Polled by the feed while phase 2 fills in summaries. */
export async function GET() {
  if (!(await requireUserId())) return unauthorized();

  try {
    const [row] = await db
      .select({ pending: count() })
      .from(articles)
      .where(eq(articles.status, "pending"));

    return Response.json({ pending: row?.pending ?? 0 });
  } catch (error) {
    return failure(error);
  }
}
