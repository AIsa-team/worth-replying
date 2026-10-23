import { redirect } from "next/navigation";
import { safeReturn } from "@/lib/server/auth";

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  if (params.error) redirect("/?authError=callback");
  const returnTo = safeReturn(typeof params.returnTo === "string" ? params.returnTo : null);
  redirect(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}
