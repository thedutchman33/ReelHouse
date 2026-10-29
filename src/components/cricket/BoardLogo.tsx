import type { CricketTeam } from "@/lib/cricket/types";
import { TeamBadge } from "./ui";

// Official national cricket-board marks, served locally so the match centre
// never waits on an external CDN. The PNGs come from BCCI's own team-asset
// catalogue; India uses the supplied BCCI emblem. Minor sides without a board
// mark fall back to the existing team monogram rather than borrowing a flag.
const BOARD_LOGOS: Record<string, { src: string; label: string }> = {
  india: { src: "/cricket/boards/india-bcci.svg", label: "BCCI" },
  "new zealand": { src: "/cricket/boards/new-zealand-nzc.png", label: "NZC" },
  australia: { src: "/cricket/boards/australia-ca.png", label: "Cricket Australia" },
  pakistan: { src: "/cricket/boards/pakistan-pcb.png", label: "PCB" },
  afghanistan: { src: "/cricket/boards/afghanistan-acb.png", label: "ACB" },
  "south africa": { src: "/cricket/boards/south-africa-csa.png", label: "CSA" },
  zimbabwe: { src: "/cricket/boards/zimbabwe-zc.png", label: "Zimbabwe Cricket" },
  "sri lanka": { src: "/cricket/boards/sri-lanka-slc.png", label: "SLC" },
  england: { src: "/cricket/boards/england-ecb.png", label: "ECB" },
  ireland: { src: "/cricket/boards/ireland-ci.png", label: "Cricket Ireland" },
  bangladesh: { src: "/cricket/boards/bangladesh-bcb.png", label: "BCB" },
  "west indies": { src: "/cricket/boards/west-indies-cwi.png", label: "CWI" },
};

function boardKey(name: string, abbreviation?: string): string | null {
  const base = name
    .toLowerCase()
    .replace(/\s+women$/i, "")
    .trim();
  if (BOARD_LOGOS[base]) return base;
  const short = abbreviation?.replace(/-?W$/i, "").toLowerCase();
  if (!short) return null;
  const aliases: Record<string, string> = {
    ind: "india",
    nzl: "new zealand",
    aus: "australia",
    pak: "pakistan",
    afg: "afghanistan",
    rsa: "south africa",
    zim: "zimbabwe",
    sl: "sri lanka",
    eng: "england",
    ire: "ireland",
    ban: "bangladesh",
    wi: "west indies",
  };
  const mapped = aliases[short];
  return mapped && BOARD_LOGOS[mapped] ? mapped : null;
}

const SIZES = {
  sm: "h-8 w-8 p-1",
  md: "h-11 w-11 p-1.5",
  lg: "h-14 w-14 p-2",
  xl: "h-20 w-20 p-2.5",
} as const;

/**
 * The board crest shown in place of the old gradient team avatar. A pale tile
 * keeps black-on-transparent marks (NZC, Pakistan's star) legible against the
 * dark score strip; sides without a local board mark keep the club-style badge.
 */
export function BoardLogo({
  team,
  size = "md",
  className = "",
}: {
  team: Pick<CricketTeam, "name" | "abbreviation"> &
    Partial<Pick<CricketTeam, "primary" | "secondary">>;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const key = boardKey(team.name, team.abbreviation);
  if (!key) {
    return (
      <TeamBadge
        team={{
          name: team.name,
          abbreviation: team.abbreviation,
          primary: team.primary ?? "#30425f",
          secondary: team.secondary ?? "#30425f",
        }}
        size={size === "xl" ? "xl" : size}
      />
    );
  }

  const logo = BOARD_LOGOS[key];
  return (
    <span
      title={`${logo.label} · ${team.name}`}
      className={`grid shrink-0 place-items-center rounded-xl border border-white/20 bg-[#f2efe6] shadow-[0_5px_18px_rgb(0_0_0/0.42),inset_0_1px_0_rgb(255_255_255/0.85)] ${SIZES[size]} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt=""
        aria-hidden="true"
        draggable={false}
        loading="lazy"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
