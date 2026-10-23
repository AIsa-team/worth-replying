import { PRIVATE_HEADERS, session } from "@/lib/server/auth";

export async function GET() {
  const caller = await session();
  return Response.json({ scope: caller?.id ?? null }, { headers: PRIVATE_HEADERS });
}
