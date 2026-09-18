import { z } from "zod";
import type { ProfileEvent } from "@/lib/run-types";
import { domainSchema, explain, readBody } from "@/lib/server/http";
import { getSearchPlan, getSiteRead } from "@/lib/server/profile";
import { watch } from "@/lib/server/progress";

export const maxDuration = 120;

const bodySchema = z.object({ domain: domainSchema });

/**
 * Step 2, watched as it happens: newline-delimited `ProfileEvent`s — the pages
 * as they are read, the profile and then the queries as the model writes them,
 * each query's measured volume, and finally the finished `read` and `plan`.
 *
 * The work itself is the same cached work `/api/profile` does; this only
 * listens in. A cached domain answers with `read` and `plan` straight away,
 * and a reader who leaves early does not stop a read others may be sharing.
 */
export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  const { domain } = body;

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
    },
    async start(controller) {
      const send = (event: ProfileEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false; // the reader went away
        }
      };

      const unwatch = watch(domain, send);
      try {
        send({ type: "read", read: await getSiteRead(domain) });
        send({ type: "plan", plan: await getSearchPlan(domain) });
      } catch (error) {
        send({ type: "error", message: explain(error) });
      } finally {
        unwatch();
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
