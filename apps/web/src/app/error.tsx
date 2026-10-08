"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import React, { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page min-h-[calc(100vh-var(--header-height)-16rem)] pb-8 pt-14 sm:pt-20" id="main-content">
      <h1 className="display max-w-3xl text-[clamp(2.25rem,5vw,4rem)]">This page failed to load.</h1>
      <p className="mt-4 max-w-prose text-ink-soft">Something went wrong while preparing it. Nothing you entered was lost. Trying again usually works; if it keeps failing, a service this page depends on may be down.</p>
      <div className="mt-7 flex flex-wrap gap-2">
        <button className="button" onClick={reset} type="button"><RotateCcw aria-hidden className="h-4 w-4" />Try again</button>
        <Link className="button-quiet" href="/">Back to the front page</Link>
      </div>
      {error.digest ? <p className="mt-8 font-mono text-xs text-ink-faint">Reference {error.digest}</p> : null}
    </main>
  );
}
