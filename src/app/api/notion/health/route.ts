import { failure, requireUserId, unauthorized } from "@/lib/api";
import { checkNotionHealth } from "@/lib/notion";

export async function GET() {
  if (!(await requireUserId())) return unauthorized();

  try {
    return Response.json(await checkNotionHealth());
  } catch (error) {
    return failure(error);
  }
}
