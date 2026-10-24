"use client";

import { useEffect, useState } from "react";
import { wordmarkFor } from "@/lib/provider-logos";

/**
 * Provider logo rendered the reference way (anatomy reverse-engineered from
 * 7reels with REA): official brand wordmark assets shown as white marks on a
 * rounded tile. Providers without a wordmark asset fall back to their TMDB
 * logo, normalized to the same white silhouette with `brightness-0 invert`
 * (exactly what the reference does for those), and a failed load hides itself.
 */
export default function ProviderLogo({
  name,
  fallbackSrc,
  className = "",
}: {
  name: string;
  /** TMDB logo URL used when no wordmark asset covers this provider. */
  fallbackSrc?: string;
  className?: string;
}) {
  const wordmark = wordmarkFor(name);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [name, fallbackSrc]);

  if (failed || (!wordmark && !fallbackSrc)) return null;
  const src = wordmark ?? fallbackSrc!;
  // The reference renders every mark as a white silhouette: their rail applies
  // `brightness-0 invert` to ALL provider logos (REA-verified img classes),
  // since the bundled wordmarks are dark/colored originals.
  const invert = "brightness-0 invert";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-contain ${invert} ${className}`}
      draggable={false}
    />
  );
}
