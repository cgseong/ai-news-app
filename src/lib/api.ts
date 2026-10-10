import { auth } from "@clerk/nextjs/server";

/**
 * proxy.ts already blocks unauthenticated traffic; this is the second lock on
 * the same door, so a route is never readable if the matcher ever drifts.
 */
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function failure(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return Response.json({ error: message }, { status });
}
