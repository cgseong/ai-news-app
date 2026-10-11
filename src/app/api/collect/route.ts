import { collectArticles } from "@/lib/collect";
import { failure, requireUserId, unauthorized } from "@/lib/api";

export async function POST() {
  if (!(await requireUserId())) return unauthorized();

  try {
    // Phase 1 only: read the feeds, store the last 24 hours, answer.
    // TODO(classification): bring back
    //   after(async () => { await enrichPending(result.runId); })
    // once the Claude translation/summary/classification step lands. Rows are
    // stored as `pending`, so enrichPending() will pick up everything collected
    // in the meantime — nothing has to be backfilled by hand.
    return Response.json(await collectArticles());
  } catch (error) {
    return failure(error);
  }
}
