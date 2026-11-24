export type WhatsNewTone =
  | "red"
  | "violet"
  | "blue"
  | "emerald"
  | "amber"
  | "cyan"
  | "gold";

export type WhatsNewIconKey =
  | "clapper"
  | "review"
  | "layers"
  | "calendar"
  | "bookmark"
  | "bell"
  | "flag"
  | "cricket"
  | "play"
  | "game";

export interface WhatsNewFeature {
  id: string;
  tag: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  icon: WhatsNewIconKey;
  tone: WhatsNewTone;
  status: "New" | "Shipped";
  highlights: [string, string];
}

// The platform updates feed. Order is deliberate: the two newest surfaces lead,
// followed by the catalogue, live sport, the library loop and the player.
export const WHATS_NEW_FEATURES: WhatsNewFeature[] = [
  {
    id: "trailers",
    tag: "Spaces · Videos",
    title: "Trailers that stay in the feed",
    description:
      "A dedicated trailer space with topic filters, instant search and a player that opens inside the card. Watch a first look, then jump to the title without losing your place.",
    href: "/trailers",
    cta: "Open trailer space",
    icon: "clapper",
    tone: "red",
    status: "New",
    highlights: ["Inline playback", "Topics & search"],
  },
  {
    id: "reviews",
    tag: "Community",
    title: "A verdict, not just a star score",
    description:
      "The Vibe Chart breaks a title into what it actually delivers, and the Moctale Meter turns the community split into a clear verdict. Hover any slice or segment, then open the live conversation on Moctale.",
    href: "/movies",
    cta: "Find a title to review",
    icon: "review",
    tone: "violet",
    status: "New",
    highlights: ["Vibe Chart", "Moctale Meter"],
  },
  {
    id: "catalogue",
    tag: "Library",
    title: "Hollywood, Bollywood and anime — one library",
    description:
      "Three catalogues share one search, one watchlist and one Continue Watching rail. Mix a Hindi release, a Japanese series and a studio film without changing apps.",
    href: "/browse",
    cta: "Browse the catalogue",
    icon: "layers",
    tone: "blue",
    status: "Shipped",
    highlights: ["3 industries", "One watchlist"],
  },
  {
    id: "formula-1",
    tag: "Live",
    title: "Race weekends, grid to podium",
    description:
      "Schedules, standings, circuit maps and live sessions share one home. Follow the season through practice, qualifying and the race without opening another tab.",
    href: "/f1",
    cta: "Open Formula 1",
    icon: "flag",
    tone: "red",
    status: "Shipped",
    highlights: ["Live sessions", "Standings & circuits"],
  },
  {
    id: "cricket",
    tag: "Live",
    title: "Cricket, ball by ball",
    description:
      "Live scores, a full match centre, scorecards, squads and player stats sit beside the live player — built for the way a cricket fan actually follows a match.",
    href: "/cricket",
    cta: "Open cricket",
    icon: "cricket",
    tone: "cyan",
    status: "Shipped",
    highlights: ["Live scores", "Full match centre"],
  },
  {
    id: "calendar",
    tag: "Library",
    title: "Your release calendar, on autopilot",
    description:
      "Follow a series and its schedule joins your timeline. Upcoming episodes, season premieres and live windows appear before they drop, with release-day alerts in the bell.",
    href: "/calendar?view=tracking",
    cta: "Open following",
    icon: "calendar",
    tone: "emerald",
    status: "Shipped",
    highlights: ["Following", "Release-day alerts"],
  },
  {
    id: "playback",
    tag: "Playback",
    title: "One player, every source",
    description:
      "Choose a source, switch servers when one struggles and pick up from the exact minute you left. The player and your progress stay in sync across films, series and episodes.",
    href: "/ott",
    cta: "See the sources",
    icon: "play",
    tone: "amber",
    status: "Shipped",
    highlights: ["Server switching", "Resume progress"],
  },
  {
    id: "games",
    tag: "Play",
    title: "Play something between episodes",
    description:
      "A browsable directory of browser games with no installs. Search the catalogue, filter by how a game runs and launch it in a tab.",
    href: "/games",
    cta: "Browse games",
    icon: "game",
    tone: "gold",
    status: "Shipped",
    highlights: ["No installs", "Searchable catalogue"],
  },
];
