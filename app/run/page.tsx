import { requirePage } from "@/lib/server/auth";
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
import { RUN_TARGET } from "@/lib/server/run";

export const metadata = {
  title: "Scoring, live — Worth Replying",
};

export default async function RunPage({ searchParams }: PageProps<"/run">) {
  const { domain, target } = await searchParams;
  const host = parseDomain(domain ?? DEFAULT_DOMAIN);
  if (!host) redirect("/");

  // `?target=40` runs a small, cheap sample; the server clamps it as well.
  const asked = Math.floor(Number(target));
  const size = asked >= 1 ? Math.min(asked, RUN_TARGET) : RUN_TARGET;
  const caller = await requirePage(`/run?domain=${encodeURIComponent(host)}&target=${size}`);

  return (
    <>
      <SiteHeader className="md:h-[58px]">
        <HeaderDivider />
        <HeaderMeta className="block text-foreground">{host}</HeaderMeta>
        <span className="grow" />
        <HeaderMeta>
          today ${spentToday(caller).toFixed(2)} of ${DAILY_BUDGET_USD.toFixed(2)}
        </HeaderMeta>

      </SiteHeader>

      <StepNav
        current={3}
        domain={host}
        target={size === RUN_TARGET ? undefined : size}
      />

      <RunConsole key={host} domain={host} target={size} />
    </>
  );
}
