"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  MoctaleMeterBucket,
  MoctaleReview,
  MoctaleSnapshot,
} from "@/lib/moctale";

type MoctaleInsightsProps = {
  snapshot?: MoctaleSnapshot | null;
  surface?: "detail" | "watch";
};

const CARD_CLASS =
  "flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#252833] bg-[#0D0E12] p-4 sm:p-5";

// Moctale's own chart palette fallbacks (used only when a genre slice has no
// colour of its own).
const VIBE_PALETTE = [
  "#7a503e",
  "#bd0010",
  "#0041a8",
  "#fe486a",
  "#00CE7A",
  "#fcb700",
  "#B048FF",
  "#EDEDED",
];

/** ECharts padAngle for the vibe donut. */
const VIBE_PAD_ANGLE = 1;
/** ECharts padAngle for the meter. */
const METER_PAD_ANGLE = 2;

function percentLabel(percent: number): string {
  if (percent < 1 && percent > 0) return "<1%";
  return `${Math.round(percent)}%`;
}

function reviewInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function vibePercentLabel(percent: number): string {
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

const round = (value: number) => Number(value.toFixed(3));

// ---------------------------------------------------------------------------
// Geometry, mirroring ECharts' pie renderer used by Moctale.
//
// Angles follow ECharts: 0° is 3 o'clock and slices sweep clockwise, i.e. the
// angle value decreases as a slice advances.
// ---------------------------------------------------------------------------

function point(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy - radius * Math.sin(radians),
  };
}

/**
 * One annular sector with the 4px rounded corners ECharts draws
 * (itemStyle.borderRadius: 4).
 */
function sectorPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number
): string {
  const sweep = start - end;
  const midRadius = (inner + outer) / 2;
  const maxByArc = (Math.abs(sweep) * Math.PI * midRadius) / 360;
  const corner = Math.max(
    0.5,
    Math.min(4, (outer - inner) / 2 - 0.5, maxByArc - 0.5)
  );
  const deltaOuter = (corner / outer) * (180 / Math.PI);
  const deltaInner = (corner / inner) * (180 / Math.PI);
  const large = Math.abs(sweep) > 180 ? 1 : 0;

  if (Math.abs(sweep) <= deltaOuter + deltaInner + 0.4) {
    const outerStart = point(cx, cy, outer, start);
    const outerEnd = point(cx, cy, outer, end);
    const innerEnd = point(cx, cy, inner, end);
    const innerStart = point(cx, cy, inner, start);
    return [
      `M ${round(outerStart.x)} ${round(outerStart.y)}`,
      `A ${outer} ${outer} 0 ${large} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
      `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
      `A ${inner} ${inner} 0 ${large} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
      "Z",
    ].join(" ");
  }

  const outerArcStart = point(cx, cy, outer, start - deltaOuter);
  const outerArcEnd = point(cx, cy, outer, end + deltaOuter);
  const outerCornerA = point(cx, cy, outer, end);
  const innerAfterOuterCorner = point(cx, cy, inner + corner, end);
  const innerCornerA = point(cx, cy, inner, end);
  const innerArcStart = point(cx, cy, inner, end + deltaInner);
  const innerArcEnd = point(cx, cy, inner, start - deltaInner);
  const innerCornerB = point(cx, cy, inner, start);
  const innerAfterInnerCorner = point(cx, cy, inner + corner, start);
  const outerCornerB = point(cx, cy, outer, start);
  const outerBeforeStart = point(cx, cy, outer - corner, start);

  return [
    `M ${round(outerArcStart.x)} ${round(outerArcStart.y)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${round(outerArcEnd.x)} ${round(outerArcEnd.y)}`,
    `Q ${round(outerCornerA.x)} ${round(outerCornerA.y)} ${round(innerAfterOuterCorner.x)} ${round(innerAfterOuterCorner.y)}`,
    `L ${round(innerAfterOuterCorner.x)} ${round(innerAfterOuterCorner.y)}`,
    `Q ${round(innerCornerA.x)} ${round(innerCornerA.y)} ${round(innerArcStart.x)} ${round(innerArcStart.y)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${round(innerArcEnd.x)} ${round(innerArcEnd.y)}`,
    `Q ${round(innerCornerB.x)} ${round(innerCornerB.y)} ${round(innerAfterInnerCorner.x)} ${round(innerAfterInnerCorner.y)}`,
    `L ${round(outerBeforeStart.x)} ${round(outerBeforeStart.y)}`,
    `Q ${round(outerCornerB.x)} ${round(outerCornerB.y)} ${round(outerArcStart.x)} ${round(outerArcStart.y)}`,
    "Z",
  ].join(" ");
}

const sameValue = (a: string | null, b: string | null) => a === b;

/** Shared 150 ms crossfade ECharts components drive from React state. */
function useCrossfade<T>(
  active: T | null,
  isSame: (a: T | null, b: T | null) => boolean
) {
  const [display, setDisplay] = useState<T | null>(active);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (isSame(active, display)) {
      // A quick hover can be reverted before its 150 ms crossfade completes.
      // Clear the fade as well, otherwise the centre stays transparent.
      setFading(false);
      return;
    }
    setFading(true);
    const swap = setTimeout(() => {
      setDisplay(active);
      setFading(false);
    }, 150);
    return () => clearTimeout(swap);
  }, [active, display, isSame]);

  return { display, fading };
}

function VibeChart({ snapshot }: { snapshot: MoctaleSnapshot }) {
  const slices = useMemo(
    () =>
      [...snapshot.vibes]
        .sort((a, b) => b.percent - a.percent)
        .slice(0, 6)
        .map((slice, index) => ({
          ...slice,
          color:
            slice.color || VIBE_PALETTE[index % VIBE_PALETTE.length] || "#EDEDED",
        })),
    [snapshot.vibes]
  );

  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const topSlug = slices[0]?.slug ?? null;
  const activeSlug = hoveredSlug ?? topSlug;

  const { display: displaySlug, fading } = useCrossfade(activeSlug, sameValue);
  const current =
    slices.find((slice) => slice.slug === displaySlug) ?? slices[0];

  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.percent), 0);

  // ECharts canvas on Moctale is 298×280 with radius 50–70% and centre 37%.
  const width = 298;
  const height = 280;
  const cx = width / 2;
  const cy = height * 0.37;
  const baseRadius = Math.min(width, height) / 2;
  const inner = baseRadius * 0.5;
  const outer = baseRadius * 0.7;

  let cursor = 0;
  const arcs = slices.map((slice) => {
    const sweep = total > 0 ? (Math.max(0, slice.percent) / total) * 360 : 0;
    // A gap can never eat a whole slice (sub-1% genres especially).
    const pad = Math.min(VIBE_PAD_ANGLE, Math.max(0, sweep - 0.15)) / 2;
    const start = cursor - pad;
    const end = cursor - sweep + pad;
    cursor -= sweep;
    return { slice, start, end };
  });

  const defaultSlice = slices[0];
  const shown = current ?? defaultSlice;

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-[#1B1B1B] py-5 lg:h-[var(--moctale-card-height)]">
      <p className="flex w-full items-center px-5 text-[15px] font-medium leading-5 tracking-[-0.01em] text-[#F4F4F5]">
        Vibe Chart
      </p>

      <div className="relative flex-1 px-0 md:px-5">
        <div className="relative mx-auto h-[280px] w-full max-w-[298px]">
          <svg
            aria-label="Vibe chart, hover a genre to see its share"
            className="h-full w-full overflow-visible"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            {arcs.map(({ slice, start, end }) => {
              const isHovered = hoveredSlug === slice.slug;
              // Moctale's ECharts emphasis grows the sector outward by 5px.
              const path = sectorPath(
                cx,
                cy,
                inner,
                outer + (isHovered ? 5 : 0),
                start,
                end
              );
              return (
                <path
                  key={slice.slug}
                  aria-label={`${slice.label}: ${vibePercentLabel(slice.percent)}`}
                  d={path}
                  fill={slice.color}
                  onPointerEnter={() => setHoveredSlug(slice.slug)}
                  onPointerLeave={() => setHoveredSlug(null)}
                  role="button"
                  stroke="#1F1F1F"
                  strokeWidth="2"
                  style={{
                    cursor: "pointer",
                    filter: isHovered
                      ? "drop-shadow(0 0 10px rgba(0, 0, 0, 0.5))"
                      : undefined,
                  }}
                  tabIndex={0}
                  onFocus={() => setHoveredSlug(slice.slug)}
                  onBlur={() => setHoveredSlug(null)}
                />
              );
            })}
          </svg>

          {shown ? (
            <div
              className="pointer-events-none absolute left-1/2 z-10 w-full -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ top: "37%" }}
            >
              <a
                className={`pointer-events-auto inline-block cursor-pointer transition-all duration-300 ease-in-out ${
                  fading ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
                }`}
                href={`/browse?genre=${encodeURIComponent(shown.label)}`}
              >
                <p className="text-sm font-medium text-[#E2E2E2] hover:underline md:text-base">
                  {shown.label}
                </p>
                <p className="text-lg font-bold text-[#E2E2E2] md:text-xl">
                  {vibePercentLabel(shown.percent)}
                </p>
              </a>
            </div>
          ) : null}
        </div>

        <div className="z-[20] -mt-12 my-4 flex w-full flex-col gap-2 px-6">
          <div className="hidden w-full flex-col gap-3 md:flex xl:flex-col">
            {slices.map((slice) => (
              <div
                key={slice.slug}
                className="flex w-full flex-row items-center justify-between"
              >
                <a
                  aria-label={`${slice.label} genre: ${slice.percent}%`}
                  className="group flex cursor-pointer flex-row items-center gap-4"
                  href={`/browse?genre=${encodeURIComponent(slice.label)}`}
                  onPointerEnter={() => setHoveredSlug(slice.slug)}
                  onPointerLeave={() => setHoveredSlug(null)}
                  onFocus={() => setHoveredSlug(slice.slug)}
                  onBlur={() => setHoveredSlug(null)}
                  tabIndex={0}
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="text-sm font-medium tracking-wider text-[#C6C6C6] transition-colors duration-200 group-hover:text-white">
                    {slice.label}
                  </span>
                </a>
                <span className="text-sm font-medium tracking-wider text-white">
                  {slice.percent}%
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-4 px-2 md:hidden">
            {slices.map((slice) => (
              <a
                key={slice.slug}
                aria-label={`${slice.label} genre: ${slice.percent}%`}
                className="group flex cursor-pointer items-center gap-2 px-1"
                href={`/browse?genre=${encodeURIComponent(slice.label)}`}
                onPointerEnter={() => setHoveredSlug(slice.slug)}
                onPointerLeave={() => setHoveredSlug(null)}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="text-xs font-medium tracking-wider text-[#C6C6C6] group-hover:text-white">
                  {slice.label} ({slice.percent}%)
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

    </article>
  );
}

function MeterGauge({
  buckets,
  totalVotes,
}: {
  buckets: MoctaleMeterBucket[];
  totalVotes: number;
}) {
  const top = buckets.reduce(
    (winner, bucket) => (bucket.percent > winner.percent ? bucket : winner),
    buckets[0]
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const { display: displayKey, fading } = useCrossfade(
    hoveredKey ?? top.key,
    sameValue
  );
  const current = buckets.find((bucket) => bucket.key === displayKey) ?? top;

  // Sub-1% verdicts are noise in the arc — they rendered as stray slivers next
  // to the leading slice. Keep them in the legend, but leave them out of the
  // donut and re-normalize the visible slices so there is no unexplained gap.
  const visibleBuckets = buckets.filter((bucket) => bucket.percent >= 1);
  const total = visibleBuckets.reduce(
    (sum, bucket) => sum + Math.max(0, bucket.percent),
    0
  );

  // ECharts: radius 100–120%, centre ["50%", "70%"], startAngle 180 → 0.
  const width = 300;
  const height = 250;
  const cx = width / 2;
  const cy = height * 0.7;
  const baseRadius = Math.min(width, height) / 2;
  const inner = baseRadius * 1.0;
  const outer = baseRadius * 1.2;

  let cursor = 180;
  const arcs = visibleBuckets.map((bucket) => {
    const sweep = total > 0 ? (Math.max(0, bucket.percent) / total) * 180 : 0;
    // A gap can never eat a whole slice (sub-1% verdicts especially).
    const pad = Math.min(METER_PAD_ANGLE, Math.max(0, sweep - 0.15)) / 2;
    const start = cursor - pad;
    const end = cursor - sweep + pad;
    cursor -= sweep;
    return { bucket, start, end };
  });

  const color = current.color || "#C6C6C6";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-center justify-center">
      <div className="relative aspect-[6/5] w-full max-w-[460px]">
        <svg
          aria-label="Moctale Meter"
          className="h-full w-full overflow-visible"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          {arcs.map(({ bucket, start, end }) => {
            const isHovered = hoveredKey === bucket.key;
            // ECharts emphasis.scaleSize: 5 — the sector grows outward only.
            const path = sectorPath(
              cx,
              cy,
              inner,
              outer + (isHovered ? 5 : 0),
              start,
              end
            );
            return (
              <path
                key={bucket.key}
                aria-label={`${bucket.label}: ${percentLabel(bucket.percent)}, ${bucket.votes} votes`}
                d={path}
                fill={bucket.color}
                onBlur={() => setHoveredKey(null)}
                onFocus={() => setHoveredKey(bucket.key)}
                onPointerEnter={() => setHoveredKey(bucket.key)}
                onPointerLeave={() => setHoveredKey(null)}
                role="button"
                style={{
                  cursor: "pointer",
                  filter: isHovered
                    ? "drop-shadow(0 0 10px rgba(0, 0, 0, 0.7))"
                    : undefined,
                }}
                tabIndex={0}
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-x-0 top-7 bottom-0 flex flex-col items-center justify-center">
          <div
            className={`flex items-start justify-center tabular-nums text-[46px] font-semibold leading-none tracking-[-0.04em] transition-all duration-300 ease-in-out sm:text-[54px] ${
              fading ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
            }`}
            style={{ color }}
          >
            {current ? (
              <>
                <span>{percentLabel(current.percent).replace("%", "")}</span>
                <span className="ml-1 mt-[0.2em] text-[0.46em] font-medium tracking-normal">
                  %
                </span>
              </>
            ) : null}
          </div>
          <div className="mt-3">
            {current ? (
              <>
                <span className="text-[15px] font-semibold tabular-nums text-white/75 sm:text-[16px]">
                  {current.votes}/{totalVotes}
                </span>{" "}
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
                  Votes
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      </div>

      <div className="z-[5000] flex w-full flex-col gap-1 px-2 sm:px-4">
        <div className="hidden w-full items-center justify-between gap-2 md:flex">
          {buckets.map((bucket) => (
            <div
              key={bucket.key}
              aria-label={`${bucket.label}: ${percentLabel(bucket.percent)}`}
              className="group flex cursor-pointer flex-row items-center whitespace-nowrap py-2"
              onBlur={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(bucket.key)}
              onPointerEnter={() => setHoveredKey(bucket.key)}
              onPointerLeave={() => setHoveredKey(null)}
              tabIndex={0}
            >
              <div className="flex flex-row items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                <span className="text-[11px] font-medium tracking-wide text-[#C6C6C6] transition-colors duration-200 group-hover:text-white">
                  {bucket.label}
                </span>
                <span className="text-[11px] font-semibold tabular-nums tracking-wide text-white">
                  {percentLabel(bucket.percent)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex w-full flex-col space-y-1 px-2 py-1 md:hidden">
          {[...buckets].reverse().map((bucket) => (
            <div
              key={`mobile-${bucket.key}`}
              aria-label={`${bucket.label}: ${percentLabel(bucket.percent)}`}
              className="flex cursor-pointer flex-row items-center justify-between px-1 py-0.5"
              onPointerEnter={() => setHoveredKey(bucket.key)}
              onPointerLeave={() => setHoveredKey(null)}
              tabIndex={0}
            >
              <div className="flex flex-row items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                <span className="text-[11px] font-medium tracking-wider text-[#C6C6C6]">
                  {bucket.label}
                </span>
              </div>
              <span className="text-[11px] font-semibold tabular-nums tracking-wider text-white">
                {percentLabel(bucket.percent)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  review,
  expanded,
  onToggle,
}: {
  review: MoctaleReview;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const text = textRef.current;
    if (!text || expanded) return;

    // line-clamp hides the rest of the copy, so compare the full content
    // height with the clamped height before offering an expansion control.
    const measure = () => {
      setCanExpand(text.scrollHeight > text.clientHeight + 1);
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [expanded, review.text]);

  return (
    <li className="border-b border-white/[0.06] py-3.5 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className="relative mt-0.5 grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10 text-[11px] font-semibold text-white/70"
          style={{ backgroundColor: `${review.verdictColor}22` }}
        >
          {reviewInitial(review.name)}
          {review.avatarUrl && !avatarFailed ? (
            // Moctale serves avatars from its own public media origin. Keep the
            // initial visible until the image actually loads (and on failure).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className={`absolute inset-0 size-full object-cover transition-opacity duration-200 ${
                avatarLoaded ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              onError={() => setAvatarFailed(true)}
              onLoad={() => setAvatarLoaded(true)}
              src={review.avatarUrl}
            />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[#E2E2E2]">
                {review.name}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-[#8A8A93]">
                @{review.username}
                {review.age ? ` · ${review.age}` : ""}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold text-black"
              style={{ backgroundColor: review.verdictColor }}
            >
              {review.verdict}
            </span>
          </div>

          <p
            ref={textRef}
            className={`mt-2 text-[12px] leading-[1.6] text-[#CCCCCC] ${
              expanded ? "" : "line-clamp-4"
            }`}
          >
            {review.text}
          </p>

          {canExpand ? (
            <button
              type="button"
              aria-expanded={expanded}
              className="mt-1.5 text-[11px] font-semibold text-[#C6C6C6] underline decoration-white/20 underline-offset-2 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
              onClick={onToggle}
            >
              {expanded ? "Show less" : "View more"}
            </button>
          ) : null}

          <div className="mt-2 flex items-center gap-3 text-[10.5px] text-white/40">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true" className="text-[11px] text-[#fe647e]">
                ♥
              </span>
              {review.likes} Likes
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden="true">💬</span>
              {review.comments} Comments
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function EmptyReviews() {
  return (
    <article className={`${CARD_CLASS} lg:h-[var(--moctale-card-height)]`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
          Top Reviews
        </h2>
      </div>
      <div className="flex flex-1 flex-col justify-center py-4">
        <p className="text-[12px] font-semibold text-white/85">
          No community reviews yet
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">
          Reviews will appear here as soon as Moctale shares them for this
          title.
        </p>
      </div>
    </article>
  );
}

function TopReviews({ snapshot }: { snapshot: MoctaleSnapshot }) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const anyExpanded = expandedIds.length > 0;

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  };

  return (
    <article
      className={`${CARD_CLASS} ${
        anyExpanded ? "" : "lg:h-[var(--moctale-card-height)]"
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-white">
            Top Reviews
          </h2>
          <p className="mt-0.5 text-[10px] text-white/35">Most liked on Moctale</p>
        </div>
      </div>

      <ul className="mt-3 min-h-0 flex-1 lg:overflow-y-auto">
        {snapshot.reviews.map((review) => (
          <ReviewRow
            key={review.id}
            review={review}
            expanded={expandedIds.includes(review.id)}
            onToggle={() => toggleExpanded(review.id)}
          />
        ))}
      </ul>

    </article>
  );
}

export default function MoctaleInsights({
  snapshot,
  surface = "detail",
}: MoctaleInsightsProps) {
  const meterCardRef = useRef<HTMLElement>(null);
  const [meterHeight, setMeterHeight] = useState<number | null>(null);

  useEffect(() => {
    const card = meterCardRef.current;
    if (!snapshot || !card) {
      setMeterHeight(null);
      return;
    }

    const measure = () => {
      const next = Math.round(card.getBoundingClientRect().height);
      if (next > 0) {
        setMeterHeight((current) => (current === next ? current : next));
      }
    };
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [snapshot]);

  // Release-only snapshots (an upcoming title with an event but no reviews) still
  // feed the hero's release card; the community block itself has nothing to show.
  if (!snapshot || snapshot.meter.totalVotes <= 0) return null;

  const hasVibes = snapshot.vibes.length > 0;
  const hasReviews = snapshot.reviews.length > 0;
  const wrapperClass = surface === "detail" ? "detail-rh py-6" : "mt-3 w-full";

  return (
    <section
      aria-label="Moctale community insights"
      className={wrapperClass}
      data-moctale-insights=""
    >
      <div
        className={`grid w-full items-start gap-3 sm:gap-4 ${
          hasVibes
            ? "lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.25fr)_minmax(0,1.6fr)]"
            : "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)]"
        }`}
        style={
          meterHeight
            ? ({ "--moctale-card-height": `${meterHeight}px` } as CSSProperties)
            : undefined
        }
      >
        {hasVibes && <VibeChart snapshot={snapshot} />}

        <article
          ref={meterCardRef}
          className="flex min-w-0 flex-col rounded-2xl bg-[#0D0E12] p-4 sm:p-5"
        >
          <div className="mb-4 flex w-full items-center md:mb-5">
            <div className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-white sm:text-[20px]">
              Moctale Meter
            </div>
          </div>

          <MeterGauge
            buckets={snapshot.meter.buckets}
            totalVotes={snapshot.meter.totalVotes}
          />
        </article>

        {hasReviews ? <TopReviews snapshot={snapshot} /> : <EmptyReviews />}
      </div>

      <p className="mt-2 text-right text-[10px] text-white/30">
        Live community data from{" "}
        <a
          className="underline decoration-white/20 underline-offset-2 hover:text-white/55"
          href={snapshot.url}
          rel="noreferrer"
          target="_blank"
        >
          Moctale
        </a>
      </p>
    </section>
  );
}
