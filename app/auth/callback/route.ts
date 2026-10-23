import { NextResponse } from "next/server";
import { authConfig, finishLogin, PRIVATE_HEADERS } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const destination = await finishLogin(new URL(request.url));
    return NextResponse.redirect(new URL(destination, authConfig().origin), { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.redirect(new URL("/?authError=callback", authConfig().origin), { headers: PRIVATE_HEADERS });
  }
}
