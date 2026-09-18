import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  HeaderDivider,
  HeaderMeta,
  SiteHeader,
} from "@/components/site-header";
import { StepNav } from "@/components/step-nav";
import { RunConsole } from "@/components/run-console";
import { DEFAULT_DOMAIN, parseDomain } from "@/lib/domain";
import { DAILY_BUDGET_USD, spentToday } from "@/lib/server/budget";
import { getSiteRead } from "@/lib/server/profile";
import { RUN_TARGET } from "@/lib/server/run";

export const metadata = {
  title: "Scoring, live — Worth Replying",
};

/** The company's own handle, once the site read has found one. */
async function Handle({ domain }: { domain: string }) {
  const handle = await getSiteRead(domain).then(
    (read) => read.profile.handle,
    () => null,
  );
  if (!handle) return null;

  return (
    <>
      <HeaderDivider />
      <HeaderMeta>@{handle}</HeaderMeta>
    </>
  );
}

export default async function RunPage({ searchParams }: PageProps<"/run">) {
  const { domain, target } = await searchParams;
  const host = parseDomain(domain ?? DEFAULT_DOMAIN);
  if (!host) redirect("/");

  // `?target=40` runs a small, cheap sample; the server clamps it as well.
  const asked = Math.floor(Number(target));
  const size = asked >= 1 ? Math.min(asked, RUN_TARGET) : RUN_TARGET;

  return (
    <>
      <SiteHeader className="md:h-[58px]">
        <HeaderDivider />
        <HeaderMeta className="block text-foreground">{host}</HeaderMeta>
        <span className="grow" />
        <HeaderMeta>
          today ${spentToday().toFixed(2)} of ${DAILY_BUDGET_USD.toFixed(2)}
        </HeaderMeta>
        <Suspense>
          <Handle domain={host} />
        </Suspense>
      </SiteHeader>

      <StepNav current={3} domain={host} />

      <RunConsole key={host} domain={host} target={size} />
    </>
  );
}
