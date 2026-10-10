import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { articles, runs } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";

export async function GET() {
  if (!(await requireUserId())) return unauthorized();

  try {
    const recent = await db.select().from(runs).orderBy(desc(runs.id)).limit(10);

    const failedArticles = await db
      .select({
        id: articles.id,
        titleEn: articles.titleEn,
        url: articles.url,
        error: articles.error,
      })
      .from(articles)
      .where(eq(articles.status, "failed"))
      .orderBy(desc(articles.id))
      .limit(50);

    return Response.json({ runs: recent, failedArticles });
  } catch (error) {
    return failure(error);
  }
}
