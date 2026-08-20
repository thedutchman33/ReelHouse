"use client";

import { useState } from "react";
import { placeholderArt } from "@/lib/utils";
import type { MediaType } from "@/types";

/**
 * Poster/backdrop <img> with a graceful fallback to branded placeholder art
 * (PRD edge case: "Missing poster/backdrop → use generated placeholder").
 * Plain <img> keeps V1 fully offline-capable; swap for next/image in Phase 2.
 */
export default function PosterImage({
  src,
  title,
  type,
  variant = "poster",
  className = "",
  priority = false,
}: {
  src?: string;
  title: string;
  type?: MediaType;
  variant?: "poster" | "backdrop";
  className?: string;
  priority?: boolean;
}) {
  const fallback = placeholderArt({ title, type, variant });
  const [failed, setFailed] = useState(false);
  const finalSrc = !src || failed ? fallback : src;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={title}
      onError={() => setFailed(true)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={className}
      draggable={false}
    />
  );
}
