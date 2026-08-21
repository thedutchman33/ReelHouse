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
  const [failed, setFailed] = useState(false);
  // Built only when it is actually needed. Every card and hero slide used to
  // serialise + encodeURIComponent a full SVG document on every render just to
  // discard it, which on the home page alone is ~160 placeholders nobody sees.
  const finalSrc = !src || failed ? placeholderArt({ title, type, variant }) : src;

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
