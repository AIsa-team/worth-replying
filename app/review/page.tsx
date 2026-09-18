import { redirect } from "next/navigation";
import { ReviewList } from "@/components/review-list";
import {
  HeaderDivider,
  HeaderMeta,
  SiteHeader,
} from "@/components/site-header";
import { StepNav } from "@/components/step-nav";
import { DEFAULT_DOMAIN, parseDomain } from "@/lib/domain";

export const metadata = {
  title: "Review — Worth Replying",
};

export default async function ReviewPage({
  searchParams,
}: PageProps<"/review">) {
  const { domain, target } = await searchParams;
  const host = parseDomain(domain ?? DEFAULT_DOMAIN);
  if (!host) redirect("/");

  // Carried along so that stepping back rejoins the same run, same size.
  const size =
    Math.floor(Number(target)) >= 1 ? Math.floor(Number(target)) : undefined;
  const params = new URLSearchParams({ domain: host });
  if (size) params.set("target", String(size));

  return (
    <>
      <SiteHeader className="md:h-[58px]">
        <HeaderDivider />
        <HeaderMeta className="block text-foreground">{host}</HeaderMeta>
      </SiteHeader>

      <StepNav current={4} domain={host} target={size} />

      <ReviewList key={host} domain={host} runHref={`/run?${params}`} />
    </>
  );
}
