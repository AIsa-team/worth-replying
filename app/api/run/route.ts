import { z } from "zod";
import { BudgetError, overBudget } from "@/lib/server/budget";
import {
  domainSchema,
  problemFrom,
  profileSchema,
  readBody,
} from "@/lib/server/http";
import { run } from "@/lib/server/run";

export const maxDuration = 300;

const bodySchema = z.object({
  domain: domainSchema,
  profile: profileSchema.optional(),
  queries: z.array(z.string().trim().min(1).max(400)).min(1).max(8).optional(),
  target: z.number().int().positive().optional(),
});

/**
 * Step 3, streamed. The response is newline-delimited JSON, one `RunEvent`
 * per line, written as each search page and each jev decision lands. Closing
 * the connection stops the run; what was already sent is the client's to keep.
 */
export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;
  if (overBudget()) return problemFrom(new BudgetError());

  const stop = new AbortController();
  const signal = AbortSignal.any([request.signal, stop.signal]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of run(body, signal)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
        controller.close();
      } catch {
        // The reader went away mid-write; there is no one left to tell.
        stop.abort();
      }
    },
    cancel() {
      stop.abort();
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
