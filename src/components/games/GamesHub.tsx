"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchIcon, PlayIcon } from "@/components/player/icons";
import {
  BITRUNLOG_NAME,
  BITRUNLOG_URL,
  GAME_ASSETS_LABEL,
  type BrowserGame,
  type BrowserGamesFeed,
} from "@/lib/games";

// ---------------------------------------------------------------------------
// Games directory UI — the /games page's interactive half.
//
// The feed arrives prerendered from the server (ISR-refreshed from the mirrored
// directory), so this component only filters and pages: search, source chips,
// and a card grid. Playing opens the project's own page in a new tab — the same
// model as the source directory, and the only model that works for all of them
// (several send `frame-ancestors 'self'`, so an in-site iframe would be blank).
//
// Hundreds of entries are in the feed, so the grid is paged. Filtering and
// search still run over the whole list; only the rendered slice is limited.
// ---------------------------------------------------------------------------

type Filter = "popular" | "all" | "instant" | "files" | "multiplayer";

// Popular first: it is the view the page opens on, followed by the same chips
// the mirrored directory uses.
const FILTERS: { id: Filter; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "all", label: "All games" },
  { id: "instant", label: "Instant play" },
  { id: "files", label: "Needs game files" },
  { id: "multiplayer", label: "Multiplayer" },
];

const DEFAULT_FILTER: Filter = "popular";

const PAGE_SIZE = 48;
const ROMAN_OR_NUMBER = /^(?:\d+|[ivxlcdm]+)$/i;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format in UTC so the server HTML and the hydrated UI always agree. */
function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Latest of the two directory timestamps. */
function latestUpdate(feed: BrowserGamesFeed): string | null {
  const times = [feed.updatedAt, feed.catalogUpdatedAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

/**
 * Initials of a title's significant words: "Grand Theft Auto III" → "gta",
 * "Need for Speed: Underground 2" → "nfsu". Game titles are usually spelled out
 * while people search the abbreviation, so this is part of the search index.
 */
function acronym(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word && !ROMAN_OR_NUMBER.test(word))
    .map((word) => word[0])
    .join("")
    .toLowerCase();
}

/** Everything the search box looks at, including the acronym. */
function searchText(game: BrowserGame): string {
  return `${game.title} ${game.platform ?? ""} ${acronym(game.title)}`.toLowerCase();
}

/** Deterministic fallback art for entries whose directory has no screenshot. */
function artSeed(title: string): { hue: number; initials: string } {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) {
    hash = (hash * 31 + title.charCodeAt(i)) % 360;
  }
  const words = title
    .replace(/\([^)]*\)/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const initials = (words.length > 1
    ? `${words[0][0]}${words[1][0]}`
    : (words[0] ?? title).slice(0, 3)
  ).toUpperCase();
  return { hue: hash, initials };
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface/50 px-3.5 py-3">
      <p className="font-display text-2xl leading-none tracking-wide text-white">{value}</p>
      <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
    </div>
  );
}

function GameCard({ game }: { game: BrowserGame }) {
  const [artFailed, setArtFailed] = useState(false);
  const art = artSeed(game.title);
  const showArt = Boolean(game.screenshotUrl) && !artFailed;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-surface/60 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-surface">
      <div className="relative aspect-video overflow-hidden bg-black">
        {showArt ? (
          // The directory's own screenshots; plain <img> so the page needs no
          // next/image remote pattern and a 404 simply falls back to the tile.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={game.screenshotUrl ?? ""}
            alt={`${game.title} screenshot`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setArtFailed(true)}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 grid place-items-center"
            style={{
              backgroundImage: `linear-gradient(135deg, hsl(${art.hue} 42% 22%), hsl(${
                (art.hue + 48) % 360
              } 46% 9%))`,
            }}
          >
            <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:22px_22px]" />
            <span className="relative font-display text-3xl tracking-[0.18em] text-white/60">
              {art.initials}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/65 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/90 backdrop-blur-sm">
          {game.platform ?? "Browser"}
        </span>
        {game.multiplayer && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-accent-ink">
            Multiplayer
          </span>
        )}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 scale-75 place-items-center rounded-full bg-accent text-accent-ink opacity-0 transition duration-300 [@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <PlayIcon size={18} />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-text">
          {game.title}
        </h3>
        <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent/85">
          {GAME_ASSETS_LABEL[game.assets]}
        </p>
        <div className="mt-auto pt-3">
          <a
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Play ${game.title} in your browser (opens in a new tab)`}
            className="btn-accent w-full text-[13px]"
          >
            <PlayIcon size={14} />
            Play in browser
          </a>
        </div>
      </div>
    </article>
  );
}

export default function GamesHub({ feed }: { feed: BrowserGamesFeed }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const stats = useMemo(() => {
    const instant = feed.games.filter((game) => game.assets === "instant").length;
    const multiplayer = feed.games.filter((game) => game.multiplayer).length;
    return { total: feed.games.length, instant, multiplayer };
  }, [feed.games]);

  // Index once per feed; every keystroke then only filters.
  const indexed = useMemo(
    () => feed.games.map((game) => ({ game, text: searchText(game) })),
    [feed.games]
  );

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return indexed
      .filter(({ game }) => {
        if (filter === "popular" && !game.popular) return false;
        if (filter === "instant" && game.assets !== "instant") return false;
        if (filter === "files" && game.assets !== "byo") return false;
        if (filter === "multiplayer" && !game.multiplayer) return false;
        return true;
      })
      .filter(({ text }) => tokens.every((token) => text.includes(token)))
      .map(({ game }) => game);
  }, [indexed, filter, query]);

  // A new search or chip starts the page over.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [filter, query]);

  const visible = filtered.slice(0, limit);
  const remaining = filtered.length - visible.length;
  const updated = formatUpdated(latestUpdate(feed));

  return (
    <section aria-label="Browser games directory">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={stats.total} label="Browser games" />
        <Stat value={stats.instant} label="Instant play" />
        <Stat value={stats.multiplayer} label="Multiplayer" />
        <Stat value={updated ?? "—"} label="Directory updated" />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="field h-10 w-full sm:max-w-[340px]">
          <SearchIcon size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // Typing searches the whole directory. Staying on the default
              // Popular view would silently hide most of the catalogue from a
              // perfectly good search; the chip stays available to re-narrow.
              if (filter === DEFAULT_FILTER) setFilter("all");
            }}
            placeholder="Search games…"
            autoComplete="off"
            aria-label="Search games"
            className="h-full w-full bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
        </label>

        <div className="no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1" role="group" aria-label="Filter games">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
              className={`pill ${filter === option.id ? "pill-active" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted" aria-live="polite">
        {filtered.length} {filtered.length === 1 ? "game" : "games"}
        {filter !== "all" ? ` · ${FILTERS.find((option) => option.id === filter)?.label}` : ""}
      </p>

      {!feed.ok ? (
        <div className="mt-4 grid min-h-[180px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 px-6 text-center">
          <p className="max-w-md text-sm leading-relaxed text-muted">
            The games directory could not be loaded right now. It refreshes
            automatically; check back in a little while, or browse the{" "}
            <a
              href={BITRUNLOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              source directory
            </a>
            .
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 grid min-h-[180px] place-items-center rounded-xl border border-dashed border-white/10 bg-black/20 px-6 text-center">
          <div>
            <p className="text-sm text-muted">No games match that search.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter(DEFAULT_FILTER);
              }}
              className="btn-ghost mt-3 text-[13px]"
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>

          {remaining > 0 && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setLimit((value) => value + PAGE_SIZE)}
                className="btn-ghost text-[13px]"
              >
                Show {Math.min(remaining, PAGE_SIZE)} more
                <span className="text-muted">· {remaining} left</span>
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-8 border-t border-white/10 pt-5 text-[12px] leading-relaxed text-muted">
        Every button opens the project&apos;s own site in a new tab. Reelhouse
        does not host or distribute any game; many projects need files from a
        copy you own. Directory mirrored, game for game, from{" "}
        <a
          href={BITRUNLOG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text/85 underline decoration-white/25 underline-offset-2 hover:decoration-white/60"
        >
          {BITRUNLOG_NAME}
        </a>
        {updated ? ` · updated ${updated}` : ""}. Never install a launcher or
        extension a game site pushes on you.
      </p>
    </section>
  );
}
