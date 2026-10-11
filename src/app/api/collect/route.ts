import { after } from "next/server";

import { collectArticles, enrichPending, failRun } from "@/lib/collect";
import { failure, requireUserId, unauthorized } from "@/lib/api";

/**
 * Phase 2 runs inside `after()`, which gets the route's max duration. 300s is
 * Vercel's fluid-compute default (and Hobby's ceiling); stating it here keeps
 * the budget `ENRICH_BATCH`/`ENRICH_DEADLINE_MS` are sized against visible in
 * the one file that owns it. Local `next dev` has no limit at all, so a clean
 * local run says nothing about whether this fits in production.
 */
export const maxDuration = 300;

export async function POST() {
  if (!(await requireUserId())) return unauthorized();

  try {
    // Phase 1: read the feeds, store the last 24 hours, answer in seconds.
    const result = await collectArticles();

    // Always, not only when `inserted > 0`: "no new articles" is not "no pending
    // backlog". Rows left behind by a killed pass, or collected before the key
    // existed, are exactly what this drains (PRD §5 F1). With nothing pending it
    // costs one SELECT.
    after(async () => {
      try {
        await enrichPending(result.runId);
      } catch (error) {
        // `after()` turns a throw into a console line and nothing else, so the
        // run would stay open and unexplained. Put it where the user can see it.
        await failRun(result.runId, error).catch(() => {});
      }
    });

    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
