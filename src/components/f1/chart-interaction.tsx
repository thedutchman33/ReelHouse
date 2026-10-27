"use client";

import { useCallback, useId, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Shared chart interaction plumbing for the hand-drawn SVG views (the
// reference paints these on canvas and shows the same card on hover: dark
// panel, title row, thin divider, label/value rows, colour-led status).
// ---------------------------------------------------------------------------

export interface TipRow {
  label: string;
  value: string;
  colour?: string;
  tone?: "up" | "down" | "muted";
}

export interface TipData {
  title: string;
  note?: string;
  rows: TipRow[];
  footer?: { text: string; colour: string }[];
}

interface TipState {
  x: number;
  y: number;
  data: TipData;
  width: number;
  height: number;
}

/** Client coordinates → the SVG's own viewBox coordinates.
 *  Uses the live screen CTM, so DPR, scroll, zoom and CSS scaling are handled. */
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** Pointer-driven tooltip state, positioned inside a relatively placed wrapper. */
export function useChartTip() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const show = useCallback(
    (clientX: number, clientY: number, data: TipData) => {
      const box = wrapRef.current?.getBoundingClientRect();
      if (!box) return;
      setTip({
        x: clientX - box.left,
        y: clientY - box.top,
        data,
        width: box.width,
        height: box.height,
      });
    },
    []
  );
  const hide = useCallback(() => setTip(null), []);
  return { wrapRef, tip, show, hide };
}

/** The reference's hover card: 240-280px wide, 8px radius, hairline border. */
export function ChartTip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  const { data } = tip;
  const flipX = tip.x > tip.width - 280;
  const flipY = tip.y > tip.height - 140;
  return (
    <div
      role="tooltip"
      className="f1-tip pointer-events-none absolute z-20 w-max max-w-[17rem] min-w-[10.5rem] rounded-lg border border-white/10 bg-[#14141d]/95 px-3 py-2 text-[11px] shadow-[0_12px_30px_rgba(0,0,0,0.6)] backdrop-blur-sm"
      style={{
        left: flipX ? undefined : Math.max(6, tip.x + 14),
        right: flipX ? Math.max(6, tip.width - tip.x + 14) : undefined,
        top: Math.max(4, Math.min(tip.height - 40, flipY ? tip.y - 120 : tip.y + 12)),
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold text-white">{data.title}</span>
        {data.note && <span className="text-[10px] whitespace-nowrap text-white/55">{data.note}</span>}
      </div>
      {data.rows.length > 0 && <div className="my-1.5 h-px bg-white/10" />}
      <div className="flex flex-col gap-1">
        {data.rows.map((r, i) => (
          <div key={`${r.label}-${i}`} className="flex items-center gap-2 leading-none">
            {r.colour && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: r.colour }}
              />
            )}
            <span className="flex-1 whitespace-nowrap text-white/70">{r.label}</span>
            <span
              className={`font-f1 tabular-nums font-medium tabular-nums ${
                r.tone === "up"
                  ? "text-emerald-400"
                  : r.tone === "down"
                    ? "text-[#ff5a4f]"
                    : r.tone === "muted"
                      ? "text-white/55"
                      : "text-white"
              }`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {data.footer && data.footer.length > 0 && (
        <div className="mt-1.5 flex items-center gap-3 border-t border-white/10 pt-1.5">
          {data.footer.map((f, i) => (
            <span key={i} className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: f.colour }}>
              {f.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Headshot disc — the reference's driver markers: team-coloured ring around a
 *  cropped portrait, falling back to the three-letter code when no photo exists. */
export function DriverDisc({
  x,
  y,
  r = 11,
  colour,
  href,
  label,
}: {
  x: number;
  y: number;
  r?: number;
  colour: string;
  href?: string | null;
  label: string;
}) {
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle cx={x} cy={y} r={r - 1.5} />
        </clipPath>
      </defs>
      <circle cx={x} cy={y} r={r} fill={colour} />
      {href ? (
        <image
          href={href}
          x={x - r}
          y={y - r}
          width={r * 2}
          height={r * 2}
          clipPath={`url(#${clipId})`}
          preserveAspectRatio="xMidYMin slice"
        />
      ) : (
        <text
          x={x}
          y={y + 3}
          textAnchor="middle"
          fontSize={r * 0.7}
          fontWeight="700"
          fill="#101017"
        >
          {label.slice(0, 3)}
        </text>
      )}
      <circle cx={x} cy={y} r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
    </g>
  );
}

/** Active dot ring — the reference enlarges the hovered point and outlines it. */
export function ActiveDot({
  x,
  y,
  colour,
  r = 4,
}: {
  x: number;
  y: number;
  colour: string;
  r?: number;
}) {
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={r + 4} fill={colour} opacity={0.18} />
      <circle cx={x} cy={y} r={r} fill="#101017" stroke="#ffffff" strokeWidth={1.6} />
      <circle cx={x} cy={y} r={Math.max(1.6, r - 2)} fill={colour} />
    </g>
  );
}
