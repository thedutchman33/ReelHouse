import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { isLiveMetadata } from "@/lib/tmdb";

// Footer — reference pattern: a slim single band under a hairline border, with
// the wordmark, one row of links, the legal line, and a back-to-top button.
// Every link goes to a route that exists; the authorization statement stays.
const LINKS: { href: string; label: string }[] = [
  { href: "/movies", label: "Movies" },
  { href: "/tv-shows", label: "TV Shows" },
  { href: "/anime", label: "Anime" },
  { href: "/browse", label: "All Titles" },
  { href: "/f1", label: "Formula 1" },
  { href: "/cricket", label: "Cricket" },
  { href: "/games", label: "Games" },
  { href: "/my-list", label: "My List" },
  { href: "/my-list#history", label: "Watch History" },
  { href: "/search", label: "Search" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 border-t border-white/10 bg-bg">
      <div className="container-rh flex flex-col gap-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Logo />
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-text/70 transition hover:text-text"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <a
            href="#top"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-muted transition hover:border-white/25 hover:text-text"
            aria-label="Back to top"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-muted/80 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} Reelhouse. Reelhouse streams only content it is authorized to
            distribute.
          </span>
          <span>
            {isLiveMetadata()
              ? "Movie & TV metadata from TMDB — this product uses the TMDB API but is not endorsed or certified by TMDB."
              : "Built with Next.js · Original branding"}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-muted/60">
          Formula 1 data from OpenF1 · Cricket data from BCCI and ICC · Game
          links open each project&apos;s own site. Reelhouse is unofficial and
          not affiliated with those rights holders.
        </p>
      </div>
    </footer>
  );
}
