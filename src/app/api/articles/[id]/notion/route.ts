import { eq } from "drizzle-orm";

import { db } from "@/db";
import { articles, categories } from "@/db/schema";
import { failure, requireUserId, unauthorized } from "@/lib/api";
import { NotionNotConfiguredError, saveArticleToNotion } from "@/lib/notion";

function notionUrl(pageId: string) {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireUserId())) return unauthorized();

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return failure("Invalid article id", 400);

  try {
    const [row] = await db
      .select({ article: articles, categoryName: categories.name })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(eq(articles.id, id));

    if (!row) return failure("Article not found", 404);

    // Saving twice would create a duplicate page, so the first save wins.
    if (row.article.notionPageId) {
      return Response.json({
        notionPageId: row.article.notionPageId,
        notionUrl: notionUrl(row.article.notionPageId),
        alreadySaved: true,
      });
    }

    const pageId = await saveArticleToNotion(row.article, row.categoryName);
    const savedAt = new Date();

    await db
      .update(articles)
      .set({ notionPageId: pageId, notionSavedAt: savedAt })
      .where(eq(articles.id, id));

    return Response.json({
      notionPageId: pageId,
      notionUrl: notionUrl(pageId),
      alreadySaved: false,
    });
  } catch (error) {
    if (error instanceof NotionNotConfiguredError) return failure(error, 400);
    return failure(error);
  }
}
