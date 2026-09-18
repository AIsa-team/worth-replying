import { redirect } from "next/navigation";
import { ProfileLive } from "@/components/profile-live";
import { SiteHeader } from "@/components/site-header";
import { DEFAULT_DOMAIN, parseDomain } from "@/lib/domain";
import { RUN_TARGET } from "@/lib/server/run";

export const metadata = {
  title: "Profile — Worth Replying",
};

export default async function ProfilePage({
  searchParams,
}: PageProps<"/profile">) {
  const { domain } = await searchParams;
  const host = parseDomain(domain ?? DEFAULT_DOMAIN);
  if (!host) redirect("/");

  return (
    <>
      <SiteHeader>
        <span className="grow" />
        <span className="hidden font-mono text-[10.5px] tracking-[0.08em] text-ember md:block">
          EVERY DECISION BY JEV — TYPESAFE&apos;S SYSTEM ONE MODEL
        </span>
      </SiteHeader>

      {/* Reads the site and writes the searches while you watch. */}
      <ProfileLive key={host} domain={host} target={RUN_TARGET} />
    </>
  );
}
