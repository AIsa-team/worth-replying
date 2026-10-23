"use client";

import { useEffect } from "react";
import { stopRun } from "@/lib/run-store";

/** A public random login scope, never the cookie or token. Also catches account
 * switches in another tab and browser back/forward restoration after logout.
 */
export function AccountBoundary({ scope }: { scope: string }) {
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/auth/session", { cache: "no-store" });
        const data = await res.json();
        if (data.scope !== scope) {
          stopRun();
          window.location.replace("/sign-in");
        }
      } catch { /* paid endpoints still fail closed if connectivity is lost */ }
    };
    const show = () => { void check(); };
    window.addEventListener("pageshow", show);
    window.addEventListener("focus", show);
    const timer = setInterval(show, 30_000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("focus", show);
    };
  }, [scope]);
  return null;
}
