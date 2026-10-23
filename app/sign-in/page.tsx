import { safeReturn } from "@/lib/server/auth";

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const returnTo = safeReturn(typeof params.returnTo === "string" ? params.returnTo : null);
  return <main className="m-auto flex max-w-xl flex-col gap-6 p-8">
    <h1 className="text-4xl">Sign in to AIsa</h1>
    <p>Website reads and X searches use your personal AIsa balance. Profile writing and jev model calls are paid for by Worth Replying.</p>
    <p>On-screen dollar figures show website-funded model costs only; your AIsa data charges are additional. A 1,000-tweet run has historically used about $0.32 in data; actual charges vary.</p>
    {params.error && <p role="alert">Sign-in could not be completed or has expired. Start again below.</p>}
    <a className="text-ember underline" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>Continue with AIsa</a>
    <a href="https://console.aisa.one" className="underline">Manage your personal AIsa balance</a>
  </main>;
}
