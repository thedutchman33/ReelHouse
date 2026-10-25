"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon, SearchIcon } from "@/components/player/icons";

// Page-level search on a provider's catalog. The catalog itself is rendered
// server-side from TMDB discover (provider + with_text_query), so this field
// commits the query to the URL (?q=) and lets the RSC payload refresh — a
// search covers the provider's whole catalog, not just the loaded page.
export default function ProviderCatalogSearch({
  providerId,
  initialQuery,
}: {
  providerId: number;
  initialQuery: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const committed = useRef(initialQuery.trim());

  useEffect(() => {
    const q = value.trim();
    const t = window.setTimeout(() => {
      if (q === committed.current) return;
      committed.current = q;
      router.replace(
        q ? `/providers/${providerId}?q=${encodeURIComponent(q)}` : `/providers/${providerId}`,
        { scroll: false }
      );
    }, 400);
    return () => window.clearTimeout(t);
  }, [value, providerId, router]);

  return (
    <div className="relative mt-6 max-w-xl">
      <SearchIcon
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setValue("");
        }}
        placeholder="Search this catalog…"
        aria-label="Search this provider's catalog"
        className="field h-10 w-full pl-9 pr-9 text-sm placeholder:text-muted/60"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-muted transition hover:text-text"
        >
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}
