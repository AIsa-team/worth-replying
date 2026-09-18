import { z } from "zod";
import { problemFrom, profileSchema, readBody } from "@/lib/server/http";
import { planSearch } from "@/lib/server/profile";

export const maxDuration = 60;

const bodySchema = z.object({ profile: profileSchema });

/**
 * Rewrite the searches from an edited profile. Never cached — the point of
 * calling it is that the profile just changed.
 */
export async function POST(request: Request) {
  const body = await readBody(request, bodySchema);
  if (body instanceof Response) return body;

  try {
    return Response.json(await planSearch(body.profile));
  } catch (error) {
    return problemFrom(error);
  }
}
