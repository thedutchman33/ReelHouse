"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import localFont from "next/font/local";
import { usePathname } from "next/navigation";
import Logo from "@/components/brand/Logo";
import AuthStatus from "@/components/auth/AuthStatus";
import { SearchIcon } from "@/components/player/icons";
import SearchOverlay from "@/components/search/SearchOverlay";
import F1SectionNav from "@/components/f1/F1SectionNav";
import CricketSectionNav from "@/components/cricket/CricketSectionNav";
import { useLiveWindows } from "@/components/live/use-live-windows";
import { windowIsLive } from "@/lib/live-windows";

// Section wordmarks keep their own typefaces in the nav: the official F1 face
// for "Formula 1", the CWC 2023 face for "Cricket". Only the bold cut is
// loaded here; the section pages themselves declare their full families.
const f1NavFont = localFont({
  src: "../../app/fonts/Formula1-Bold.woff2",
  weight: "700",
  style: "normal",
  variable: "--font-f1-nav",
  display: "swap",
});
const cricketNavFont = localFont({
  src: "../../app/fonts/India2023-Bold.ttf",
  weight: "700",
  style: "normal",
  variable: "--font-cricket-nav",
  display: "swap",
});

// ---------------------------------------------------------------------------
// Primary navigation — reference navbar replica.
//
// A fixed, floating rounded bar inset from the viewport edges; page content
// (and the home hero) slides beneath it via the --rh-nav-h offset. Links are a
// pill group: the active route in a filled pill, the rest as plain text. The
// right side carries bare icon controls (search, account). On scroll the bar
// gains a glass blur.
//
// Layout is two-tier below `xl` (brand + search + account on top, the link row
// underneath, horizontally scrollable) and a single row from `xl` up. The two
// section wordmarks are display faces, so the links need the room before they
// share a row with the icon controls.
// ---------------------------------------------------------------------------

interface NavLink {
  href: string;
  label: string;
  /** Section colour: F1 red, cricket blue, games yellow. */
  tone?: "f1" | "cricket" | "games";
  /** Which live window stamps a blinking LIVE above this label. */
  live?: "f1" | "cricket";
  /** Detail routes belong to their section, so /movie/603 lights up "Movies". */
  match?: (pathname: string) => boolean;
}

interface LiveFlags {
  f1: boolean;
  cricket: boolean;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  { href: "/movies", label: "Movies", match: (p) => p === "/movies" || p.startsWith("/movie/") },
  { href: "/tv-shows", label: "Series", match: (p) => p === "/tv-shows" || p.startsWith("/tv/") },
  { href: "/anime", label: "Anime", match: (p) => p === "/anime" || p.startsWith("/anime/") },
  { href: "/f1", label: "Formula 1", tone: "f1", live: "f1", match: (p) => p === "/f1" || p.startsWith("/f1/") },
  { href: "/cricket", label: "Cricket", tone: "cricket", live: "cricket", match: (p) => p === "/cricket" || p.startsWith("/cricket/") },
  { href: "/games", label: "Games", tone: "games", match: (p) => p === "/games" || p.startsWith("/games/") },
  { href: "/my-list", label: "My List" },
];

// Section tints, legible on the dark bar; hover brightens one step.
const TONE_TEXT: Record<NonNullable<NavLink["tone"]>, string> = {
  f1: "text-[#f87171] hover:text-[#fca5a5]",
  cricket: "text-[#60a5fa] hover:text-[#93c5fd]",
  games: "text-[#facc15] hover:text-[#fde047]",
};

function isActive(link: NavLink, pathname: string): boolean {
  if (link.match) return link.match(pathname);
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function NavLinks({
  pathname,
  live,
  className = "",
}: {
  pathname: string;
  live: LiveFlags;
  className?: string;
}) {
  return (
    <nav className={className} aria-label="Primary">
      {LINKS.map((link) => {
        const active = isActive(link, pathname);
        const isLive = link.live ? live[link.live] : false;
        const colour = link.tone
          ? TONE_TEXT[link.tone]
          : active
            ? "text-white"
            : "text-white/85 hover:text-white";
        const sectionFont =
          link.tone === "f1"
            ? "var(--font-f1-nav)"
            : link.tone === "cricket"
              ? "var(--font-cricket-nav)"
              : undefined;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-8 shrink-0 items-center rounded-lg px-3.5 text-[15px] font-medium leading-none transition ${
              active ? "bg-white/10" : ""
            } ${colour}`}
          >
            {/* Stamped above the label inside the pill: the label stays on the
                same baseline as every other nav item, and the stamp cannot be
                clipped by the mobile row's horizontal scroller. */}
            <span
              className={`relative flex items-center ${sectionFont ? "font-bold" : ""}`}
              style={sectionFont ? { fontFamily: sectionFont } : undefined}
            >
              {isLive && (
                <span
                  aria-hidden="true"
                  className="live-blink absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-black uppercase tracking-[0.18em] text-[#ff3b30]"
                >
                  Live
                </span>
              )}
              {link.label}
              {isLive && <span className="sr-only"> — live now</span>}
            </span>
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
  const { feed, now } = useLiveWindows();
  const live: LiveFlags = {
    f1: Boolean(feed.f1 && now && windowIsLive(feed.f1, now)),
    cricket: Boolean(feed.cricket && now && windowIsLive(feed.cricket, now)),
  };

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

  const onF1 = pathname === "/f1" || pathname.startsWith("/f1/");
  const onCricket = pathname === "/cricket" || pathname.startsWith("/cricket/");

  return (
    <>
      <header
        className={`${f1NavFont.variable} ${cricketNavFont.variable} fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-8 lg:px-11`}
      >
        <div
          className={`mx-auto max-w-[1920px] rounded-xl border transition-all duration-300 ${
            scrolled
              ? "border-white/10 bg-[rgb(12_13_14/0.72)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl backdrop-saturate-150"
              : "border-white/[0.06] bg-[rgb(12_13_14/0.65)] backdrop-blur-xl backdrop-saturate-150"
          }`}
        >
          <div className="flex h-12 items-center gap-4 px-4 sm:px-5">
            <Logo className="shrink-0" />

            <NavLinks
              pathname={pathname}
              live={live}
              className="ml-2 hidden items-center gap-1 xl:flex"
            />

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
            live={live}
            className="no-scrollbar flex items-center gap-1 overflow-x-auto px-3 pb-2.5 xl:hidden"
          />
        </div>

        {/* Section jump bars, docked under the main bar's right edge. */}
        {onF1 && (
          <div className="mx-auto mt-1.5 flex max-w-[1920px] justify-end">
            <F1SectionNav />
          </div>
        )}
        {onCricket && (
          <div className="mx-auto mt-1.5 flex max-w-[1920px] justify-end">
            <CricketSectionNav />
          </div>
        )}
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
