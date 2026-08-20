import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { isLiveMetadata } from "@/lib/tmdb";

// Footer. Every link here goes to a route that exists — there are no placeholder
// destinations, and no social icons, because Reelhouse has no social accounts to
// point at. The authorization statement is deliberate and stays.
const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Browse",
    links: [
      { href: "/movies", label: "Movies" },
      { href: "/tv-shows", label: "TV Shows" },
      { href: "/browse", label: "All Titles" },
      { href: "/browse?sort=latest", label: "New Releases" },
      { href: "/browse?sort=rating", label: "Top Rated" },
    ],
  },
  {
    title: "My Stuff",
    links: [
      { href: "/my-list", label: "My List" },
      { href: "/my-list#history", label: "Watch History" },
      { href: "/#continue", label: "Continue Watching" },
      { href: "/search", label: "Search" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-surface/30">
      <div className="container-rh py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2 lg:max-w-sm">
            <Logo />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A cinematic way to discover films and series — browse, search, track what
              you&apos;re watching, and pick up where you left off.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-text/80 transition hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted/70 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {year} Reelhouse. Reelhouse streams only content it is authorized to
            distribute.
          </span>
          <span>
            {isLiveMetadata()
              ? "Metadata from TMDB — this product uses the TMDB API but is not endorsed or certified by TMDB."
              : "Built with Next.js · Original branding"}
          </span>
        </div>
      </div>
    </footer>
  );
}
