import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { articles, categories, runs, type Category, type RunError } from "@/db/schema";
import { getLlmProvider, LlmNotConfiguredError, type LlmProvider } from "@/lib/llm";
import { fetchFeed } from "@/lib/rss";
import { SOURCES } from "@/lib/sources";

/** How many articles one enrichment pass will work through. */
const ENRICH_BATCH = 60;
/** Concurrent LLM calls. Low on purpose — this is a personal app, not a crawler. */
const ENRICH_CONCURRENCY = 3;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function appendRunErrors(runId: number, newErrors: RunError[]) {
  if (newErrors.length === 0) return;
  await db
    .update(runs)
    .set({ errors: sql`${runs.errors} || ${JSON.stringify(newErrors)}::jsonb` })
    .where(eq(runs.id, runId));
}

/**
 * Phase 1 (PRD §5 F1): read the feeds and store what is new. Deliberately does
 * no LLM work so the button can answer in a couple of seconds.
 */
export async function collectArticles() {
  const [run] = await db.insert(runs).values({}).returning({ id: runs.id });

  const results = await Promise.allSettled(SOURCES.map((source) => fetchFeed(source)));

  const errors: RunError[] = [];
  const seen = new Set<string>();
  const rows: (typeof articles.$inferInsert)[] = [];
  let fetched = 0;

  results.forEach((result, i) => {
    const source = SOURCES[i];
    if (result.status === "rejected") {
      // A dead feed must not take the run down with it.
      errors.push({
        stage: "fetch",
        source: source.id,
        message: errorMessage(result.reason),
      });
      return;
    }

    for (const item of result.value) {
      fetched += 1;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      rows.push({
        url: item.url,
        source: source.id,
        titleEn: item.titleEn,
        contentEn: item.contentEn,
        publishedAt: item.publishedAt,
        imageUrl: item.imageUrl,
        status: "pending",
      });
    }
  });

  const inserted =
    rows.length === 0
      ? []
      : await db
          .insert(articles)
          .values(rows)
          .onConflictDoNothing({ target: articles.url })
          .returning({ id: articles.id });

  await db
    .update(runs)
    .set({ fetched, inserted: inserted.length })
    .where(eq(runs.id, run.id));
  await appendRunErrors(run.id, errors);

  return { runId: run.id, fetched, inserted: inserted.length, errors };
}

function resolveCategory(categoryList: Category[], name: string): Category | undefined {
  const wanted = name.trim().toLowerCase();
  return (
    categoryList.find((c) => c.name.trim().toLowerCase() === wanted) ??
    categoryList.find((c) => c.isFallback)
  );
}

async function enrichOne(
  provider: LlmProvider,
  categoryList: Category[],
  article: { id: number; titleEn: string; contentEn: string | null },
): Promise<RunError | null> {
  try {
    const result = await provider.enrich({
      titleEn: article.titleEn,
      contentEn: article.contentEn,
      categories: categoryList.map((c) => ({ name: c.name, hint: c.hint })),
    });

    const category = resolveCategory(categoryList, result.category);

    await db
      .update(articles)
      .set({
        titleKo: result.title_ko,
        summaryKo: result.summary_ko,
        categoryId: category?.id ?? null,
        categoryReason: result.category_reason,
        llmModel: provider.id,
        status: "enriched",
        error: null,
      })
      .where(eq(articles.id, article.id));

    return null;
  } catch (error) {
    const message = errorMessage(error);
    await db
      .update(articles)
      .set({ status: "failed", error: message })
      .where(eq(articles.id, article.id));
    return { stage: "enrich", message };
  }
}

/** Runs `worker` over `items` with a small fixed pool. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Phase 2 (PRD §5 F1): translate/summarise/classify everything still pending.
 * Also the retry path — anything left behind by an earlier run is picked up here.
 */
export async function enrichPending(runId?: number) {
  const pending = await db
    .select({ id: articles.id, titleEn: articles.titleEn, contentEn: articles.contentEn })
    .from(articles)
    .where(eq(articles.status, "pending"))
    .orderBy(desc(articles.publishedAt))
    .limit(ENRICH_BATCH);

  if (pending.length === 0) {
    if (runId) await db.update(runs).set({ finishedAt: new Date() }).where(eq(runs.id, runId));
    return { enriched: 0, failed: 0 };
  }

  let provider: LlmProvider;
  try {
    provider = getLlmProvider();
  } catch (error) {
    // No key, no summaries — but collection and browsing stay up (PRD §10).
    if (runId) {
      await appendRunErrors(runId, [{ stage: "enrich", message: errorMessage(error) }]);
      await db.update(runs).set({ finishedAt: new Date() }).where(eq(runs.id, runId));
    }
    if (error instanceof LlmNotConfiguredError) return { enriched: 0, failed: 0 };
    throw error;
  }

  const categoryList = await db.select().from(categories).orderBy(asc(categories.sortOrder));

  const failures: RunError[] = [];
  let enriched = 0;

  await pool(pending, ENRICH_CONCURRENCY, async (article) => {
    const failure = await enrichOne(provider, categoryList, article);
    if (failure) failures.push(failure);
    else enriched += 1;
  });

  if (runId) {
    await db
      .update(runs)
      .set({ enriched, failed: failures.length, finishedAt: new Date() })
      .where(eq(runs.id, runId));
    await appendRunErrors(runId, failures);
  }

  return { enriched, failed: failures.length };
}

/** Re-queue failed articles so the next enrichment pass picks them up. */
export async function retryFailed(ids?: number[]) {
  const target = ids?.length
    ? db
        .update(articles)
        .set({ status: "pending", error: null })
        .where(inArray(articles.id, ids))
    : db
        .update(articles)
        .set({ status: "pending", error: null })
        .where(eq(articles.status, "failed"));

  await target;
  return enrichPending();
}
