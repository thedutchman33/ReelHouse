"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/brand/Logo";
import AuthStatus from "@/components/auth/AuthStatus";
import TrackingBell from "@/components/notifications/TrackingBell";
import {
  BookmarkIcon,
  ClapperboardIcon,
  FilmIcon,
  GamepadIcon,
  HomeIcon,
  SparklesIcon,
  ToriiIcon,
  TvIcon,
} from "@/components/library/icons";
import { SearchIcon } from "@/components/player/icons";
import { MusicBrandMark } from "@/components/music/icons";
import SearchOverlay from "@/components/search/SearchOverlay";
import F1SectionNav from "@/components/f1/F1SectionNav";
import CricketSectionNav from "@/components/cricket/CricketSectionNav";
import { useLiveWindows } from "@/components/live/use-live-windows";
import { windowIsLive } from "@/lib/live-windows";

// ---------------------------------------------------------------------------
// Primary navigation — reference navbar replica.
//
// A fixed, floating rounded bar inset from the viewport edges; page content
// (and the home hero) slides beneath it via the --rh-nav-h offset. The primary
// destinations are icon controls: white line icons for the catalogue, the
// official F1 and BCCI marks for those sections, and a controller for Games.
// Desktop mirrors Moctale's primary nav motion: destinations rest as icon-only
// controls, the active/hovered destination opens its label inline, and one
// red underline glides beneath the open item. The mobile row keeps the
// compact labels-under-icons treatment. The right side carries the bare icon
// treatment for search, trailers, What's New, calendar and account.
//
// Layout is two-tier below `xl` (brand + utility icons on top, the destination
// row underneath) and a single row from `xl` up.
// ---------------------------------------------------------------------------

type NavIcon =
  | "home"
  | "movies"
  | "series"
  | "anime"
  | "music"
  | "f1"
  | "cricket"
  | "games"
  | "list";

interface NavLink {
  href: string;
  label: string;
  icon: NavIcon;
  /** Section colour: F1 red, cricket blue, games yellow, music green. */
  tone?: "f1" | "cricket" | "games" | "music";
  /** Which live window stamps a blinking LIVE above this label. */
  live?: "f1" | "cricket";
  /** Detail routes belong to their section, so /movie/603 lights up "Movies". */
  match?: (pathname: string) => boolean;
  /** Opt this link out of route prefetching. */
  prefetch?: false;
}

interface LiveFlags {
  f1: boolean;
  cricket: boolean;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  {
    href: "/movies",
    label: "Movies",
    icon: "movies",
    match: (p) => p === "/movies" || p.startsWith("/movie/"),
  },
  {
    href: "/tv-shows",
    label: "Series",
    icon: "series",
    match: (p) => p === "/tv-shows" || p.startsWith("/tv/"),
  },
  {
    href: "/anime",
    label: "Anime",
    icon: "anime",
    match: (p) => p === "/anime" || p.startsWith("/anime/"),
  },
  {
    href: "/music",
    label: "Music",
    icon: "music",
    tone: "music",
    match: (p) => p === "/music" || p.startsWith("/music/"),
  },
  // Formula 1 is the one route that must not be prefetched. Its page CSS
  // declares the whole Formula 1 family (Regular/Italic/Bold/Black), and
  // prefetching the route makes the client router insert that CSS — which
  // eagerly downloads the three faces the nav does not use. Measured cost of
  // that prefetch on the home page: ~83KB of fonts and 3 requests competing
  // with the hero artwork, for a section most visitors never open. The route
  // is ISR-cached, so a real click is still cheap.
  {
    href: "/f1",
    label: "Formula 1",
    icon: "f1",
    tone: "f1",
    live: "f1",
    prefetch: false,
    match: (p) => p === "/f1" || p.startsWith("/f1/"),
  },
  {
    href: "/cricket",
    label: "Cricket",
    icon: "cricket",
    tone: "cricket",
    live: "cricket",
    match: (p) => p === "/cricket" || p.startsWith("/cricket/"),
  },
  {
    href: "/games",
    label: "Games",
    icon: "games",
    tone: "games",
    match: (p) => p === "/games" || p.startsWith("/games/"),
  },
  { href: "/my-list", label: "My List", icon: "list" },
];

// Section tints, legible on the dark bar; hover brightens one step.
const TONE_TEXT: Record<NonNullable<NavLink["tone"]>, string> = {
  f1: "text-[#f87171] hover:text-[#fca5a5]",
  cricket: "text-[#60a5fa] hover:text-[#93c5fd]",
  games: "text-[#facc15] hover:text-[#fde047]",
  music: "text-[#1ed760] hover:text-[#3be477]",
};

// Six icon controls share the phone bar with the logo now. They step down to
// 32px below 360px, 36px on small phones, and settle at 40px from `sm` up.
// The logo stays at its compact height until 380px, where the icon group and
// the wordmark both still fit inside the 320px-safe phone geometry.
const NAV_ICON_CONTROL =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition min-[360px]:h-9 min-[360px]:w-9 sm:h-10 sm:w-10";

function CalendarIcon({ size = 21 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}

function isActive(link: NavLink, pathname: string): boolean {
  if (link.match) return link.match(pathname);
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function NavGlyph({ icon }: { icon: NavIcon }) {
  switch (icon) {
    case "music":
      return <MusicBrandMark size={22} />;
    case "f1":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/f1/brand/f1-logo.svg"
          alt=""
          draggable={false}
          className="h-auto w-[30px]"
        />
      );
    case "cricket":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/cricket/brand/bcci-logo.svg"
          alt=""
          draggable={false}
          className="h-[21px] w-[21px]"
        />
      );
    case "home":
      return <HomeIcon size={20} />;
    case "movies":
      return <FilmIcon size={20} />;
    case "series":
      return <TvIcon size={20} />;
    case "anime":
      return <ToriiIcon size={20} />;
    case "games":
      return <GamepadIcon size={20} />;
    case "list":
      return <BookmarkIcon size={20} />;
  }
}

function DesktopNavLinks({
  pathname,
  live,
  className = "",
}: {
  pathname: string;
  live: LiveFlags;
  className?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const underlineRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());
  const previousLayout = useRef<
    Map<string, { left: number; width: number }> | null
  >(null);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [focusedHref, setFocusedHref] = useState<string | null>(null);
  const [measured, setMeasured] = useState(false);

  const activeLink = LINKS.find((link) => isActive(link, pathname)) ?? null;
  const revealedHref =
    hoveredHref ?? focusedHref ?? activeLink?.href ?? null;

  const positionUnderline = () => {
    const nav = navRef.current;
    const underline = underlineRef.current;
    if (!nav || !underline) return;

    const target = revealedHref
      ? itemRefs.current.get(revealedHref)
      : undefined;
    if (!target) {
      underline.style.opacity = "0";
      return;
    }

    underline.style.setProperty(
      "--nav-underline-x",
      `${target.offsetLeft}px`
    );
    underline.style.setProperty(
      "--nav-underline-w",
      `${target.offsetWidth}px`
    );
    underline.style.opacity = "1";
  };

  // Layout effect, not effect: measure the final label-open geometry before
  // the browser paints, then FLIP the icon row while the shared underline
  // transitions to its new item. offsetLeft/offsetWidth intentionally ignore
  // an in-flight FLIP transform, so rapid hover changes stay accurate.
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const nextLayout = new Map<string, { left: number; width: number }>();
    for (const [href, element] of itemRefs.current) {
      nextLayout.set(href, {
        left: element.offsetLeft,
        width: element.offsetWidth,
      });
    }

    const previous = previousLayout.current;
    if (previous && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const [href, element] of itemRefs.current) {
        const before = previous.get(href);
        const after = nextLayout.get(href);
        if (!before || !after) continue;
        const delta = before.left - after.left;
        if (Math.abs(delta) < 0.5 || typeof element.animate !== "function") {
          continue;
        }
        element.animate(
          [
            { transform: `translateX(${delta}px)` },
            { transform: "translateX(0)" },
          ],
          {
            duration: 320,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }
        );
      }
    }
    previousLayout.current = nextLayout;

    positionUnderline();
    if (!measured) setMeasured(true);
  }, [revealedHref, pathname, measured]);

  // Fonts and viewport changes move the label widths without a hover event.
  useEffect(() => {
    let cancelled = false;
    const reposition = () => {
      if (cancelled) return;
      positionUnderline();
    };
    window.addEventListener("resize", reposition);
    void document.fonts?.ready.then(reposition);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", reposition);
    };
  }, [revealedHref]);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className={`relative ${className}`}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocusedHref(null);
        }
      }}
      onPointerLeave={() => setHoveredHref(null)}
    >
      <span
        ref={underlineRef}
        aria-hidden="true"
        className="nav-underline pointer-events-none absolute bottom-0 left-0 z-0 h-[2px] rounded-full bg-[#e11d2a] opacity-0 shadow-[0_0_12px_rgba(225,29,42,0.65)]"
        data-ready={measured ? "true" : "false"}
        style={{
          left: "var(--nav-underline-x, 0px)",
          width: "var(--nav-underline-w, 0px)",
        }}
      />

      {LINKS.map((link) => {
        const active = isActive(link, pathname);
        const open = revealedHref === link.href;
        const isLive = link.live ? live[link.live] : false;
        const iconColour =
          link.icon === "music"
            ? "text-[#1ed760] group-hover:text-[#3be477]"
            : link.icon === "games"
              ? "text-[#facc15] group-hover:text-[#fde047]"
              : open
                ? "text-white"
                : "text-white/55 group-hover:text-white/90";

        return (
          <Link
            key={link.href}
            ref={(element) => {
              if (element) itemRefs.current.set(link.href, element);
              else itemRefs.current.delete(link.href);
            }}
            href={link.href}
            prefetch={link.prefetch}
            aria-label={isLive ? `${link.label} — live now` : link.label}
            aria-current={active ? "page" : undefined}
            className={`group relative z-[1] flex h-12 shrink-0 items-center rounded-lg px-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/60 ${
              open ? "text-white" : "text-white/55 hover:text-white/90"
            }`}
            onFocus={() => setFocusedHref(link.href)}
            onPointerEnter={() => setHoveredHref(link.href)}
          >
            <span
              className={`relative grid h-8 w-8 shrink-0 place-items-center transition-colors ${iconColour}`}
            >
              <NavGlyph icon={link.icon} />
              {isLive && (
                <span
                  aria-hidden="true"
                  className="live-blink absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#ff3b30] shadow-[0_0_6px_#ff3b30]"
                />
              )}
            </span>
            <span
              aria-hidden="true"
              className={`block origin-left overflow-hidden whitespace-nowrap text-[13px] font-semibold leading-none tracking-[-0.01em] transition-[opacity,transform] duration-250 ease-out motion-reduce:transition-none ${
                open
                  ? "max-w-[120px] scale-x-100 opacity-100"
                  : "max-w-0 scale-x-0 opacity-0"
              }`}
            >
              <span className="pl-2">{link.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
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
        const iconColour =
          link.icon === "music"
            ? "text-[#1ed760] group-hover:text-[#3be477]"
            : link.icon === "games"
              ? "text-[#facc15] group-hover:text-[#fde047]"
              : active
                ? "text-white"
                : "text-white/85 group-hover:text-white";
        const labelColour = active
          ? "text-white"
          : link.tone
            ? TONE_TEXT[link.tone]
            : "text-white/55 group-hover:text-white/80";
        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={link.prefetch}
            aria-label={
              isLive ? `${link.label} — live now` : link.label
            }
            aria-current={active ? "page" : undefined}
            className={`group relative flex h-12 min-w-[48px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-2 transition-colors xl:min-w-[58px] xl:px-1.5 ${
              active ? "bg-transparent" : "hover:bg-white/[0.035]"
            }`}
          >
            <span
              className={`relative grid h-8 w-8 place-items-center rounded-[10px] transition-colors ${iconColour} ${
                active
                  ? "bg-white/[0.13] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "group-hover:bg-white/[0.07]"
              }`}
            >
              <NavGlyph icon={link.icon} />
              {isLive && (
                <span
                  aria-hidden="true"
                  className="live-blink absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-[#ff3b30] shadow-[0_0_6px_#ff3b30]"
                />
              )}
            </span>
            <span
              className={`max-w-[76px] truncate text-[10px] font-semibold leading-none tracking-[0.01em] ${labelColour}`}
            >
              {link.label}
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
        className="fixed inset-x-0 top-0 z-50 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[calc(0.75rem_+_env(safe-area-inset-top))] sm:px-8 sm:pt-[calc(0.75rem_+_env(safe-area-inset-top))] lg:px-11"
      >
        <div
          className={`relative z-10 mx-auto max-w-[1920px] rounded-xl border transition-all duration-300 ${
            scrolled
              ? "border-white/10 bg-[rgb(12_13_14/0.72)] shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl backdrop-saturate-150"
              : "border-white/[0.06] bg-[rgb(12_13_14/0.65)] backdrop-blur-xl backdrop-saturate-150"
          }`}
        >
          <div className="flex h-12 items-center gap-2 px-2 sm:gap-4 sm:px-5">
            <Logo className="shrink-0 [&_img]:h-7 min-[380px]:[&_img]:h-8 sm:[&_img]:h-10" />

            <DesktopNavLinks
              pathname={pathname}
              live={live}
              className="ml-3 hidden items-center gap-2 xl:flex xl:gap-2.5"
            />

            <div className="ml-auto flex shrink-0 items-center gap-0 min-[360px]:gap-0.5 sm:gap-1.5">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className={`${NAV_ICON_CONTROL} text-white/80 hover:bg-white/5 hover:text-white`}
              >
                <SearchIcon size={21} />
              </button>
              <Link
                href="/trailers"
                aria-label="Trailers"
                title="Trailers"
                aria-current={
                  pathname === "/trailers" || pathname.startsWith("/trailers/")
                    ? "page"
                    : undefined
                }
                className={`${NAV_ICON_CONTROL} ${
                  pathname === "/trailers" || pathname.startsWith("/trailers/")
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <ClapperboardIcon size={20} />
              </Link>
              <Link
                href="/whats-new"
                aria-label="What's New"
                title="What's New"
                aria-current={
                  pathname === "/whats-new"
                    ? "page"
                    : undefined
                }
                className={`${NAV_ICON_CONTROL} ${
                  pathname === "/whats-new"
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <SparklesIcon size={20} />
              </Link>
              <Link
                href="/calendar"
                aria-label="Calendar"
                title="Calendar"
                aria-current={pathname.startsWith("/calendar") ? "page" : undefined}
                className={`${NAV_ICON_CONTROL} ${
                  pathname.startsWith("/calendar")
                    ? "bg-white/10 text-white"
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <CalendarIcon size={21} />
              </Link>
              <TrackingBell />
              <AuthStatus />
            </div>
          </div>

          {/* Mobile link row — scrolls horizontally instead of wrapping or clipping. */}
          <NavLinks
            pathname={pathname}
            live={live}
            className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-3 pb-2.5 xl:hidden"
          />
        </div>

        {/* Section jump bars, docked under the main bar's right edge. */}
        {onF1 && (
          <div className="relative z-0 mx-auto mt-1.5 flex max-w-[1920px] justify-end">
            <F1SectionNav />
          </div>
        )}
        {onCricket && (
          <div className="relative z-0 mx-auto mt-1.5 flex max-w-[1920px] justify-end">
            <CricketSectionNav />
          </div>
        )}
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
