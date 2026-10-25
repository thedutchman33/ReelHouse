"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/brand/Logo";
import AuthStatus from "@/components/auth/AuthStatus";
import { SearchIcon } from "@/components/player/icons";
import SearchOverlay from "@/components/search/SearchOverlay";

// ---------------------------------------------------------------------------
// Primary navigation — reference navbar replica.
//
// A fixed, floating rounded bar inset from the viewport edges; page content
// (and the home hero) slides beneath it via the --rh-nav-h offset. Links are a
// pill group: the active route in a filled pill, the rest as plain text. The
// right side carries bare icon controls (search, account). On scroll the bar
// gains a glass blur.
//
// Layout is two-tier below `sm` (brand + search + account on top, the link row
// underneath, horizontally scrollable) and a single row from `sm` up. Nothing
// here is allowed to force horizontal page scroll on a 320px viewport.
// ---------------------------------------------------------------------------

interface NavLink {
  href: string;
  label: string;
  /** Detail routes belong to their section, so /movie/603 lights up "Movies". */
  match?: (pathname: string) => boolean;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  { href: "/movies", label: "Movies", match: (p) => p === "/movies" || p.startsWith("/movie/") },
  { href: "/tv-shows", label: "Series", match: (p) => p === "/tv-shows" || p.startsWith("/tv/") },
  { href: "/anime", label: "Anime", match: (p) => p === "/anime" || p.startsWith("/anime/") },
  { href: "/f1", label: "Formula 1", match: (p) => p === "/f1" || p.startsWith("/f1/") },
  { href: "/my-list", label: "My List" },
];

function isActive(link: NavLink, pathname: string): boolean {
  if (link.match) return link.match(pathname);
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function NavLinks({ pathname, className = "" }: { pathname: string; className?: string }) {
  return (
    <nav className={className} aria-label="Primary">
      {LINKS.map((link) => {
        const active = isActive(link, pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[15px] font-medium transition ${
              active
                ? "bg-white/10 text-white"
                : "text-white/85 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Navbar({

}: {
}) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // "/" opens the search overlay from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The watch route is a standalone player page (reference pattern): a floating
  // Back chip instead of the site navbar.
  if (pathname.startsWith("/watch")) {
    return <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />;
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-8 lg:px-11">
        <div
          className={`mx-auto max-w-[1920px] rounded-xl border transition-all duration-300 ${
            scrolled
              ? "border-white/10 bg-[rgb(12_13_14/0.72)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl backdrop-saturate-150"
              : "border-white/[0.04] bg-[rgb(15_16_17/0.92)]"
          }`}
        >
          <div className="flex h-12 items-center gap-4 px-4 sm:px-5">
            <Logo className="shrink-0" />

            <NavLinks pathname={pathname} className="ml-2 hidden items-center gap-1 sm:flex" />

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="grid h-10 w-10 place-items-center rounded-lg text-white/80 transition hover:bg-white/5 hover:text-white"
              >
                <SearchIcon size={21} />
              </button>
              <AuthStatus />
            </div>
          </div>

          {/* Mobile link row — scrolls horizontally instead of wrapping or clipping. */}
          <NavLinks
            pathname={pathname}
            className="no-scrollbar flex items-center gap-1 overflow-x-auto px-3 pb-2.5 sm:hidden"
          />
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
