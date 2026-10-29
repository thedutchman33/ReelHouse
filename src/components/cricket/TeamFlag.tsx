import type { CricketTeam } from "@/lib/cricket/types";

// Team identity assets are kept local so the cricket page never waits on a
// third-party flag CDN. West Indies (a multi-nation side) has no country flag,
// so it falls back to the maroon team mark instead of borrowing one member's.
const FLAG_CODES: Record<string, string> = {
  india: "in",
  "new zealand": "nz",
  australia: "au",
  pakistan: "pk",
  afghanistan: "af",
  "south africa": "za",
  zimbabwe: "zw",
  "sri lanka": "lk",
  england: "gb-eng",
  ireland: "ie",
  netherlands: "nl",
  namibia: "na",
  "united states of america": "us",
  "united states": "us",
  usa: "us",
  japan: "jp",
  ind: "in",
  nzl: "nz",
  aus: "au",
  pak: "pk",
  afg: "af",
  rsa: "za",
  zim: "zw",
  sl: "lk",
  eng: "gb-eng",
  ire: "ie",
  ned: "nl",
  nam: "na",
  jpn: "jp",
};

const SIZES = {
  xs: "h-3 w-[18px] text-[6px]",
  sm: "h-3.5 w-5 text-[7px]",
  md: "h-4 w-7 text-[8px]",
  lg: "h-6 w-9 text-[9px]",
} as const;

export function flagCodeFor(name: string, abbreviation?: string): string | null {
  const base = name
    .toLowerCase()
    .replace(/\s+women$/i, "")
    .trim();
  if (FLAG_CODES[base]) return FLAG_CODES[base];
  const code = abbreviation?.replace(/-?W$/i, "").toLowerCase();
  return code ? FLAG_CODES[code] ?? null : null;
}

/**
 * Small country marker beside a team name. Purely decorative — the team name
 * is always adjacent, so screen readers do not need a second announcement.
 */
export function TeamFlag({
  team,
  size = "sm",
  className = "",
}: {
  team: Pick<CricketTeam, "name" | "abbreviation">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const code = flagCodeFor(team.name, team.abbreviation);
  if (!code) {
    const westIndies = /west indies/i.test(team.name);
    const label = westIndies ? "WI" : team.abbreviation.replace(/-W$/i, "").slice(0, 3);
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-[3px] font-bold uppercase leading-none ring-1 ring-inset ${SIZES[size]} ${
          westIndies
            ? "text-white/80 ring-white/20"
            : "bg-white/[0.06] text-white/40 ring-white/10"
        } ${className}`}
        style={westIndies ? { background: "linear-gradient(135deg, #951a42, #5c0f28)" } : undefined}
      >
        {label || "—"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/cricket/flags/${code}.svg`}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      className={`shrink-0 rounded-[3px] object-cover ring-1 ring-inset ring-white/20 ${SIZES[size]} ${className}`}
    />
  );
}

export function FlagByCode({
  code,
  name,
  size = "sm",
  className = "",
}: {
  code: string;
  name?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return <TeamFlag team={{ name: name ?? code, abbreviation: code }} size={size} className={className} />;
}
