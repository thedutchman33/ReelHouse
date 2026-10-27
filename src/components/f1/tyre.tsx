// Tyre-compound visuals shared by the session centre and telemetry centre —
// the classic F1 compound idents: a ring in the compound colour with the
// compound letter, plus GP-Tempo's chart-dot fill mapping.

export const COMPOUND_DOT: Record<string, string> = {
  SOFT: "#FF5733",
  MEDIUM: "#FFC300",
  HARD: "#FFFFFF",
  WET: "#05009c",
  INTERMEDIATE: "#008714",
};

export function dotForCompound(compound: string | null | undefined): string {
  if (compound) return COMPOUND_DOT[compound.toUpperCase()] ?? "#FFFFFF";
  return "#FFFFFF";
}

const RING: Record<string, string> = {
  SOFT: "#EF4444",
  MEDIUM: "#F7C334",
  HARD: "#E5E7EB",
  INTERMEDIATE: "#10B981",
  WET: "#3B82F6",
};

/** The official compound idents (black casing, coloured ring, white letter). */
const TYRE_ICON: Record<string, string> = {
  SOFT: "/f1/tyres/soft.svg",
  MEDIUM: "/f1/tyres/medium.svg",
  HARD: "/f1/tyres/hard.svg",
  INTERMEDIATE: "/f1/tyres/intermediate.svg",
  WET: "/f1/tyres/wet.svg",
};

const COMPOUND_LABEL: Record<string, string> = {
  SOFT: "Soft",
  MEDIUM: "Medium",
  HARD: "Hard",
  INTERMEDIATE: "Intermediate",
  WET: "Wet",
};

/**
 * One-lap tyre ident: the official compound icon, falling back to a dashed
 * ring for compounds the feed doesn't name. GP-Tempo marks every lap cell with
 * its compound; OpenF1's stint records give us the real compound per lap.
 */
export function TyreBadge({
  compound,
  size = 14,
}: {
  compound: string | null | undefined;
  size?: number;
}) {
  const key = (compound ?? "").toUpperCase();
  const icon = TYRE_ICON[key];
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        aria-hidden="true"
        draggable={false}
        title={`${COMPOUND_LABEL[key]} tyre`}
        className="shrink-0 select-none"
      />
    );
  }
  const ring = RING[key] ?? "rgba(255,255,255,0.35)";
  const letter =
    key === "SOFT"
      ? "S"
      : key === "MEDIUM"
        ? "M"
        : key === "HARD"
          ? "H"
          : key === "INTERMEDIATE"
            ? "I"
            : key === "WET"
              ? "W"
              : "?";
  const UNKNOWN = !RING[key];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle
        cx="12"
        cy="12"
        r="7.2"
        fill="none"
        stroke={ring}
        strokeWidth={UNKNOWN ? 2 : 3.4}
        strokeDasharray={UNKNOWN ? "2.5 2.2" : "3 2.4"}
        opacity={UNKNOWN ? 0.8 : 1}
      />
      {!UNKNOWN && (
        <text
          x="12"
          y="16.2"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill={ring}
        >
          {letter}
        </text>
      )}
    </svg>
  );
}

/** GP-Tempo's fallback palette (their pick-colour fallback when a driver
 *  colour is already taken — ported as-is). */
export const FALLBACK_LAP_COLORS = [
  "#E2E2E2",
  "#f0ad4e",
  "#74edac",
  "#c174ed",
  "#ef24ee",
  "#ed7488",
  "#9e69ff",
];
