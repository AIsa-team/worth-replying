import { NextResponse } from "next/server";
import { authConfig, clearSession, PRIVATE_HEADERS, sameOrigin } from "@/lib/server/auth";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403, headers: PRIVATE_HEADERS });
  await clearSession();
  return NextResponse.redirect(new URL("/", authConfig().origin), {
    status: 303, headers: { ...PRIVATE_HEADERS, "Clear-Site-Data": '"cache", "storage"' },
  });
}
