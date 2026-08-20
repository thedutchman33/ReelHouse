"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/components/brand/Logo";
import AuthStatus from "@/components/auth/AuthStatus";
import { CloseIcon, SearchIcon } from "@/components/player/icons";

// ---------------------------------------------------------------------------
// Primary navigation.
//
// Translucent over the hero and solid-glass once scrolled, so the bar is always
// readable without ever hiding the artwork behind it.
//
// Layout is two-tier below `sm` (brand + search + account on top, the link row
// underneath, horizontally scrollable) and a single row from `sm` up. That is
// what keeps a 320px viewport from overflowing sideways — nothing here is
// allowed to force horizontal page scroll.
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
  { href: "/tv-shows", label: "TV Shows", match: (p) => p === "/tv-shows" || p.startsWith("/tv/") },
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
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-surface-2/70 text-text"
                : "text-muted hover:bg-surface-2/40 hover:text-text"
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
  userEmail = null,
  userName = null,
}: {
  userEmail?: string | null;
  userName?: string | null;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Leaving the page closes the expanded mobile field, so it never lingers over
  // the next screen's content.
  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) mobileInputRef.current?.focus();
  }, [searchOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearchOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const searchField = (
    <div className="field h-9">
      <SearchIcon size={16} className="shrink-0 text-muted" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search movies, series, genres…"
        aria-label="Search movies, series, genres"
        className="w-full min-w-0 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
      />
    </div>
  );

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "glass border-b"
          : "border-b border-transparent bg-gradient-to-b from-black/85 via-black/45 to-transparent"
      }`}
    >
      <div className="container-rh flex h-14 items-center gap-3 sm:h-16 sm:gap-4">
        {searchOpen ? (
          // Mobile: the field takes over the row rather than squeezing into it.
          <form onSubmit={submit} role="search" className="flex flex-1 items-center gap-2 sm:hidden">
            <div className="min-w-0 flex-1">{searchField}</div>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="Close search"
              className="icon-btn"
            >
              <CloseIcon size={16} />
            </button>
          </form>
        ) : (
          <>
            <Logo className="shrink-0" />

            <NavLinks pathname={pathname} className="ml-2 hidden items-center gap-1 sm:flex" />

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <form onSubmit={submit} role="search" className="hidden sm:block">
                <div className="w-44 lg:w-64">{searchField}</div>
              </form>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                aria-expanded={searchOpen}
                className="icon-btn sm:hidden"
              >
                <SearchIcon size={17} />
              </button>

              <AuthStatus initialEmail={userEmail} initialName={userName} />
            </div>
          </>
        )}
      </div>

      {/* Mobile link row — scrolls horizontally instead of wrapping or clipping. */}
      <div className="container-rh sm:hidden">
        <NavLinks
          pathname={pathname}
          className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-2"
        />
      </div>
    </header>
  );
}
