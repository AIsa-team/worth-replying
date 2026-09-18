"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = ["aisa.one", "typesafe.ai", "resend.com"];

/** Strip the scheme and any path so the field always holds a bare host. */
function normalize(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

function DomainForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("aisa.one");

  function go(value: string) {
    const host = normalize(value);
    if (!host) return;
    router.push(`/profile?domain=${encodeURIComponent(host)}`);
  }

  return (
    <div className="flex w-full max-w-[660px] flex-col gap-[9px]">
      <label
        htmlFor="domain"
        className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground"
      >
        DOMAIN
      </label>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(domain);
        }}
        className="flex h-[66px] items-center rounded-lg border border-foreground bg-card pl-5"
      >
        <span className="hidden font-mono text-sm text-muted-foreground sm:block">
          https://
        </span>
        <Input
          id="domain"
          name="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          autoComplete="url"
          spellCheck={false}
          aria-label="Domain to read"
          className="h-auto grow rounded-none border-0 bg-transparent px-2.5 font-serif text-xl text-foreground shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-[26px]"
        />
        <Button
          type="submit"
          className="mr-[7px] h-[52px] shrink-0 px-5 font-mono text-[13px] font-medium tracking-[0.14em] md:px-7"
        >
          FIND
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-1 font-mono text-[11.5px] text-muted-foreground">
        <span>try it on</span>
        {SUGGESTIONS.map((host, i) => (
          <span key={host} className="flex items-center gap-x-3.5">
            {i > 0 && <span className="text-faint">/</span>}
            <button
              type="button"
              onClick={() => {
                setDomain(host);
                go(host);
              }}
              className="text-ember underline underline-offset-2 transition-colors hover:text-primary"
            >
              {host}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export { DomainForm };
