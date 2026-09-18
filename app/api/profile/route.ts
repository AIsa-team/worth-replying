import { z } from "zod";
import { spentToday } from "@/lib/server/budget";
import { domainSchema, problemFrom, readBody } from "@/lib/server/http";
import { getSearchPlan, getSiteRead } from "@/lib/server/profile";

export const maxDuration = 120;

const bodySchema = z.object({ domain: domainSchema });

/**
 * Step 2 in one call: read the site into a profile, then write the searches.
 * Cached per domain for a day, so asking twice costs nothing the second time.
 */
export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    const read = await getSiteRead(body.domain);
    const plan = await getSearchPlan(body.domain);
    return Response.json({ read, plan, spentToday: spentToday() });
  } catch (error) {
    return problemFrom(error);
  }
}
