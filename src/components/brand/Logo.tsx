"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Site logo: the operator's racing wordmark (white REEL / red HOUSE) as a
// transparent PNG — the black source background was keyed out so the mark sits
// directly on the navbar glass and the footer.
//
// The HOUSE half carries the section's colour: blue on cricket, yellow on games,
// red everywhere else. The variants are pre-rendered from the same artwork, so
// the wordmark and its anti-aliasing stay identical — only the red pixels move.
const VARIANTS = [
  { prefix: "/cricket", src: "/logo-cricket.png" },
  { prefix: "/games", src: "/logo-games.png" },
] as const;

export default function Logo({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const src =
    VARIANTS.find((variant) => pathname.startsWith(variant.prefix))?.src ?? "/logo.png";

  return (
    <Link
      href="/"
      className={`group inline-flex items-center ${className}`}
      aria-label="Reelhouse home"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Reelhouse"
        className="h-10 w-auto"
        draggable={false}
      />
    </Link>
  );
}
