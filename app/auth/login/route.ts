import { NextResponse } from "next/server";
import { beginLogin, PRIVATE_HEADERS } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    return NextResponse.redirect(await beginLogin(new URL(request.url).searchParams.get("returnTo")), { headers: PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: "AIsa sign-in is unavailable. Ask the website operator to check OAuth configuration." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
