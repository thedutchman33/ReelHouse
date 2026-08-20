"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook for real error monitoring (PRD: logging/monitoring). For now, console.
    console.error(error);
  }, [error]);

  return (
    <div className="container-rh grid min-h-[60vh] place-items-center py-16 text-center">
      <div>
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">
          An unexpected error occurred while loading this page.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-ghost">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
