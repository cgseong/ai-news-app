import type { NextRequest } from "next/server";

import { failure, requireUserId, unauthorized } from "@/lib/api";
import { listArticles } from "@/lib/queries";

export async function GET(request: NextRequest) {
  if (!(await requireUserId())) return unauthorized();

  try {
    const params = request.nextUrl.searchParams;
    const categoryId = Number(params.get("category"));
    const offset = Math.max(0, Number(params.get("offset")) || 0);

    return Response.json(
      await listArticles({
        categoryId: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : null,
        offset,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
