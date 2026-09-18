import "server-only";

import { z } from "zod";
import { parseDomain } from "@/lib/domain";
import { AisaError } from "./aisa";
import { BudgetError } from "./budget";
import { UnreadableSiteError } from "./profile";

/* ── Request bodies ──────────────────────────────────────────────────────── */

export const domainSchema = z.string().transform((value, ctx) => {
  const domain = parseDomain(value);
  if (domain) return domain;
  ctx.addIssue({ code: "custom", message: "Not a domain" });
  return z.NEVER;
});

const line = z.string().trim().min(1).max(200);

/** A profile as the editable block on the profile screen would send it back. */
export const profileSchema = z.object({
  domain: domainSchema,
  whatYouDo: z.string().trim().min(1).max(300),
  whoBuysIt: z.array(line).min(1).max(6),
  whatHurts: z
    .array(
      z.object({
        key: z
          .string()
          .regex(/^[a-z0-9]{1,24}$/)
          .refine((key) => key !== "none", "Reserved"),
        label: line,
      }),
    )
    .min(1)
    .max(6),
  whoElse: z.array(line).max(6),
  handle: z
    .string()
    .regex(/^\w{1,15}$/)
    .nullable(),
});

export async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S> | Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return problem(400, "Body must be JSON.");
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return parsed.data;

  const issue = parsed.error.issues[0];
  return problem(400, `${issue.path.join(".") || "body"}: ${issue.message}`);
}

/* ── Responses ───────────────────────────────────────────────────────────── */

function problem(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/** Map what the pipeline can throw onto a status a client can act on. */
export function problemFrom(error: unknown) {
  if (error instanceof BudgetError) return problem(402, error.message);
  if (error instanceof UnreadableSiteError) return problem(422, error.message);
  if (error instanceof AisaError) {
    const upstream = error.status === 401 || error.status === 403;
    return problem(upstream ? 500 : 502, error.message);
  }
  console.error(error);
  return problem(500, error instanceof Error ? error.message : "Unknown error");
}

/**
 * The same errors as a sentence for the page. Server Component errors reach
 * the browser redacted in production, so screens catch and print this instead.
 */
export function explain(error: unknown) {
  if (error instanceof BudgetError || error instanceof UnreadableSiteError) {
    return error.message;
  }
  console.error(error);
  if (error instanceof AisaError) {
    return "The data service did not answer. Try again in a moment.";
  }
  return "Something went wrong on our side. Try again in a moment.";
}
