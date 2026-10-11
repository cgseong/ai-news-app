import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { articles, categories, runs, type Category, type RunError } from "@/db/schema";
import { getLlmProvider, LlmNotConfiguredError, type LlmProvider } from "@/lib/llm";
import { fetchFeed, type FeedItem } from "@/lib/rss";
import { COLLECT_WINDOW_HOURS, ITEMS_PER_FEED, SOURCES } from "@/lib/sources";

/**
 * How many articles one enrichment pass will work through. A 24-hour window
 * across two feeds caps at `ITEMS_PER_FEED * SOURCES.length` = 40 in theory and
 * runs 10-25 in practice, so a normal day finishes in one pass and a backlog
 * drains over two. The real constraint is the `after()` budget — see below.
 */
const ENRICH_BATCH = 30;
/**
 * Concurrent LLM calls. Sized by the `after()` budget, not by politeness to the
 * sources: 30/6 is five rounds. `src/db/index.ts` is the neon-http driver (one
 * independent HTTP request per query), so there is no connection pool to starve.
 */
const ENRICH_CONCURRENCY = 6;
/**
 * Stop handing out *new* work with enough of the budget left to report; Vercel's
 * fluid-compute default is 300s and `after()` runs inside it. This bounds the
 * common overrun — a day with more articles than rounds — not a single article
 * that hangs, whose ceiling is the provider's timeout times its retries. If one
 * does blow the budget the function dies mid-batch, which costs nothing beyond a
 * run with no `finishedAt`: the rows stay `pending` and the next collect resumes.
 */
const ENRICH_DEADLINE_MS = 240_000;

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

type DatedItem = FeedItem & { publishedAt: Date };

function isFresh(item: FeedItem, cutoff: Date): item is DatedItem {
  return item.publishedAt !== null && item.publishedAt >= cutoff;
}

/**
 * Phase 1 (PRD §5 F1): read the feeds and store what is new. Deliberately does
 * no LLM work so the button can answer in a couple of seconds.
 *
 * Only items published inside the window are kept. An item with no date is
 * skipped: "the last 24 hours" is not a question that can be answered for it,
 * and guessing would let the whole back catalogue in on the first run.
 */
export async function collectArticles({
  windowHours = COLLECT_WINDOW_HOURS,
}: { windowHours?: number } = {}) {
  const [run] = await db.insert(runs).values({}).returning({ id: runs.id });
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);

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

    fetched += result.value.length;

    const fresh = result.value
      .filter((item): item is DatedItem => isFresh(item, cutoff))
      // Newest first, so ITEMS_PER_FEED drops the oldest of a busy day rather
      // than whatever the feed happened to list last.
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, ITEMS_PER_FEED);

    for (const item of fresh) {
      // `articles.url` is unique, but a single INSERT cannot conflict with
      // itself — the same link in both feeds has to be caught here.
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      rows.push({
        url: item.url,
        source: source.id,
        author: item.author,
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
          // Everything collected before is already here; this is the dedup.
          .onConflictDoNothing({ target: articles.url })
          .returning({ id: articles.id });

  await db
    .update(runs)
    // `finishedAt` is phase 2's to stamp — enrichPending() writes it on every
    // exit path (nothing pending, no key, done). Leaving it null here is what
    // gives the column a meaning: a run that never got one had its enrichment
    // pass killed before it could report.
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
      // Record the model on the failure too: comparing models is half the point
      // of the provider layer, and "which one failed" is part of that comparison.
      .set({ status: "failed", error: message, llmModel: provider.id })
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
 *
 * Note that `runId` only says where to *report*: the pass drains the pending
 * queue, not this run's rows, so a run can report `inserted: 3, enriched: 28`
 * after clearing a backlog. Scoping it to the run's own ids would split this
 * signature from the retry path, which has no run at all.
 */
export async function enrichPending(runId?: number) {
  const deadline = Date.now() + ENRICH_DEADLINE_MS;

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
  let skipped = 0;

  await pool(pending, ENRICH_CONCURRENCY, async (article) => {
    // Out of budget: leave it pending rather than start work the function will
    // be killed in the middle of. The next collect picks it up.
    if (Date.now() > deadline) {
      skipped += 1;
      return;
    }
    const failure = await enrichOne(provider, categoryList, article);
    if (failure) failures.push(failure);
    else enriched += 1;
  });

  if (runId) {
    await db
      .update(runs)
      .set({ enriched, failed: failures.length, finishedAt: new Date() })
      .where(eq(runs.id, runId));
    // Skipped rows are not failures — they were never attempted — so they stay
    // out of the `failed` count and are reported as their own line instead.
    await appendRunErrors(runId, [
      ...failures,
      ...(skipped > 0
        ? [
            {
              stage: "enrich" as const,
              message: `시간 예산을 다 써서 ${skipped}건을 넘겼습니다. 다음 수집 때 이어집니다.`,
            },
          ]
        : []),
    ]);
  }

  return { enriched, failed: failures.length };
}

/**
 * Close a run on an error that escaped `enrichPending()`. `after()` swallows a
 * throw into `console.error`, so without this the run would stay open with
 * nothing to show for it — and the run log is the only place the user looks.
 */
export async function failRun(runId: number, error: unknown) {
  await appendRunErrors(runId, [{ stage: "enrich", message: errorMessage(error) }]);
  await db.update(runs).set({ finishedAt: new Date() }).where(eq(runs.id, runId));
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
