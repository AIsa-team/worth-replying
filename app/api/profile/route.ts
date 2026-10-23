import { authorize, PRIVATE_HEADERS } from "@/lib/server/auth";
import { z } from "zod";
import { spentToday } from "@/lib/server/budget";
import { domainSchema, problemFrom, readBody } from "@/lib/server/http";
import { getSearchPlan, getSiteRead, progressKey } from "@/lib/server/profile";

export const maxDuration = 120;

const bodySchema = z.object({ domain: domainSchema });

/**
 * Step 2 in one call: read the site into a profile, then write the searches.
 * Reused per login and domain while this server instance retains the session result.
 */
export async function POST(request: Request) {
  const caller = await authorize(request);
  if (caller instanceof Response) return caller;
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    const read = await getSiteRead(caller, body.domain);
    const plan = await getSearchPlan(caller, body.domain);
    return Response.json({ read, plan, spentToday: spentToday(caller) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return problemFrom(error);
  }
}
