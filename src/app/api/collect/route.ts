import { after } from "next/server";

import { collectArticles, enrichPending } from "@/lib/collect";
import { failure, requireUserId, unauthorized } from "@/lib/api";

export async function POST() {
  if (!(await requireUserId())) return unauthorized();

  try {
    const result = await collectArticles();

    // Phase 2 runs after the response is sent, so the button answers in seconds
    // and the client polls pending-count while summaries land (PRD §5 F1).
    after(async () => {
      await enrichPending(result.runId);
    });

    return Response.json(result);
  } catch (error) {
    return failure(error);
  }
}
