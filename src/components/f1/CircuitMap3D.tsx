"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CircuitGeometry } from "@/lib/circuit";

// ---------------------------------------------------------------------------
// 3D circuit map: the REAL track center-line (MultiViewer geometry) drawn as
// a thin tilted ribbon with a low extruded side wall — like the broadcast
// circuit maps. White edge outline, kerb dashes only at apex zones (rim
// stripes), compact numbered pins tucked beside each corner apex (collision
// resolved so nothing overlaps), start/finish diamond, and a small red
// racing light + comet tail that laps the layout. Pure SVG (no three.js);
// depth is drawn geometry, the tilt is a CSS transform — crisp, palette-locked
// (red/white/black/grey/blue). Falls back to the official outline image.
// ---------------------------------------------------------------------------

// Ribbon geometry (path units). The ribbon is intentionally THIN (~3px on
// screen) so the circuit's true shape reads first, corners second.
const ASPHALT_W = 3.4;
const EDGE_W = 4.15; // white outline under-stroke
const CORE_W = ASPHALT_W - 1.35; // asphalt core left over kerb stripes
const WALL_DROP = 4.6; // side-wall extrusion below the ribbon
const KERB_CHUNK = 1.8; // red/white dash period at apexes

export default function CircuitMap3D({
  circuitInfoUrl,
  circuitImage,
  name,
  variant = "track",
}: {
  /** OpenF1's link to MultiViewer's circuit geometry API. */
  circuitInfoUrl: string | null;
  /** Official F1 outline PNG (fallback). */
  circuitImage: string | null;
  name: string;
  /**
   * `track` (default) is the broadcast ribbon. `sectors` paints the F1-site
   * calendar layout — three coloured sector bands, sector labels, the speed
   * trap — on the same extruded plate, so the tilt and the lapping light stay.
   */
  variant?: "track" | "sectors";
}) {
  const [geo, setGeo] = useState<CircuitGeometry | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!circuitInfoUrl) return;
    let alive = true;
    const qs = new URLSearchParams({ url: circuitInfoUrl, key: name });
    fetch(`/api/f1/circuit?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: CircuitGeometry) => alive && d.points?.length && setGeo(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [circuitInfoUrl, name]);

  if (geo) return <TrackScene geo={geo} variant={variant} />;
  if (circuitImage) return <TiltedImage src={circuitImage} alt={`${name} circuit map`} />;
  return (
    <div className="grid h-40 place-items-center text-xs text-white/30">
      {failed ? "Circuit map unavailable" : "Loading map…"}
    </div>
  );
}

// ------------------------------ the 3D scene --------------------------------

interface Label {
  number: number;
  x: number;
  y: number;
  tx: number; // unit tangent
  ty: number;
  nx: number; // unit normal (pre-sign)
  ny: number;
  ox: number; // unit outward normal
  oy: number;
  apex: number;
}

const SECTOR_COLOURS = ["#ff1801", "#00a0de", "#ffd800"] as const;

function readingAngle(angle: number): number {
  let a = angle;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
}

function TrackScene({ geo, variant }: { geo: CircuitGeometry; variant: "track" | "sectors" }) {
  const sectors = variant === "sectors";
  // The calendar sheet is its own plate: a taller side wall under the sector
  // ribbon, matched by a deeper tilt on the scene.
  const drop = sectors ? 5.2 : WALL_DROP;
  const L = useMemo(() => {
    const pts = geo.points;
    const n = pts.length;
    const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // --- corner pins: sit tight beside the apex, off the ribbon by just
    // enough; resolve clashes by sliding along the track or pushing slightly
    // further out — never far from the corner they label.
    const OFF = ASPHALT_W / 2 + 3.3; // pin center off the centerline
    const labels: Label[] = geo.corners.map((c) => {
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = dist(pts[i], [c.x, c.y]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const p0 = pts[best];
      const a = pts[(best + n - 1) % n];
      const b = pts[(best + 1) % n];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      const side = nx * (c.x - cx) + ny * (c.y - cy) >= 0 ? 1 : -1; // outward
      const ox = nx * side;
      const oy = ny * side;
      return { number: c.number, apex: best, tx, ty, nx, ny, ox, oy, x: p0[0] + ox * OFF, y: p0[1] + oy * OFF };
    });
    {
      const placed: { x: number; y: number }[] = [];
      for (const l of labels) {
        for (let i = 0; i < 7; i++) {
          if (placed.every((p) => Math.hypot(p.x - l.x, p.y - l.y) >= 7)) break;
          if (i % 2 === 0) {
            l.x += l.ox * 1.7;
            l.y += l.oy * 1.7;
          } else {
            l.x += l.tx * 3.4;
            l.y += l.ty * 3.4;
          }
        }
        placed.push({ x: l.x, y: l.y });
      }
    }

    // --- kerbs: dashes only around each corner apex, merged into runs.
    const K_HALF = ASPHALT_W * 0.62;
    const marked = new Uint8Array(n);
    for (const c of labels) {
      if (c.apex == null) continue;
      let i = c.apex;
      let acc = 0;
      do {
        marked[i] = 1;
        const j = (i + 1) % n;
        acc += dist(pts[i], pts[j]);
        i = j;
      } while (acc <= K_HALF);
      i = c.apex;
      acc = 0;
      do {
        marked[i] = 1;
        const j = (i + n - 1) % n;
        acc += dist(pts[i], pts[j]);
        i = j;
      } while (acc <= K_HALF);
    }
    const runs: Array<[number, number]> = [];
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (marked[i] && start === -1) start = i;
      if (!marked[i] && start !== -1) {
        runs.push([start, i - 1]);
        start = -1;
      }
    }
    if (start !== -1) {
      const first = runs[0];
      if (first && first[0] === 0) {
        runs.shift();
        runs.push([start, first[1] + n]);
      } else runs.push([start, n - 1]);
    }
    const kerbDs = runs.map(([s, e]) =>
      pts
        .map((_, k) => (s + k) % n)
        .slice(0, e - s + 1)
        .map((idx, k) => `${k === 0 ? "M" : "L"} ${pts[idx][0].toFixed(2)} ${pts[idx][1].toFixed(2)}`)
        .join(" ")
    );

    // --- sector bands (calendar layout): lap-distance thirds, each labelled in
    // the roomiest gap outside the ribbon so nothing sits on the track.
    const segPath = (from: number, to: number) => {
      const out: string[] = [];
      for (let i = from; i <= to && i < n; i++) {
        out.push(`${i === from ? "M" : "L"} ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`);
      }
      return out.join(" ");
    };
    const angleAt = (i: number) => {
      const a = pts[(i - 2 + n) % n];
      const b = pts[(i + 2) % n];
      return readingAngle((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
    };
    // A sector name belongs on its own band, and reads best on a straight:
    // set the word on the flattest stretch of that band, just off the ribbon.
    // Straights carry no corners, so no number can land under the text.
    const anchorFor = (from: number, to: number) => {
      const span = to - from;
      let index = from + Math.floor(span / 2);
      if (span >= 6) {
        const turnAt = (i: number) => {
          const a = angleAt((i - 6 + n) % n);
          const b = angleAt((i + 6) % n);
          const d = Math.abs(b - a);
          return d > 180 ? 360 - d : d;
        };
        let runStart = -1;
        let bestRun = -1;
        for (let i = from; i <= to; i++) {
          const flat = i < to && turnAt(i % n) < 12;
          if (flat && runStart === -1) runStart = i;
          if ((!flat || i === to) && runStart !== -1) {
            const runEnd = flat ? i : i - 1;
            if (runEnd - runStart > bestRun) {
              bestRun = runEnd - runStart;
              index = Math.round((runStart + runEnd) / 2);
            }
            runStart = -1;
          }
        }
      }
      const at = ((index % n) + n) % n;
      const p = pts[at];
      const angle = angleAt(at);
      const rad = (angle * Math.PI) / 180;
      let nx = -Math.sin(rad);
      let ny = Math.cos(rad);
      if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      return { x: p[0] + nx * 6.2, y: p[1] + ny * 6.2, angle };
    };
    const [split1, split2] = geo.sectorSplits;
    const sectorBands = [
      { d: segPath(0, split1), label: "SECTOR 1", colour: SECTOR_COLOURS[0], anchor: anchorFor(0, split1) },
      { d: segPath(split1, split2), label: "SECTOR 2", colour: SECTOR_COLOURS[1], anchor: anchorFor(split1, split2) },
      {
        d: `${segPath(split2, n - 1)} L ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`,
        label: "SECTOR 3",
        colour: SECTOR_COLOURS[2],
        anchor: anchorFor(split2, n),
      },
    ];

    // Speed trap: the official marker sits at the end of the longest straight,
    // held off the ribbon on the outside of the layout.
    const trap = geo.speedTrap
      ? (() => {
          const st = geo.speedTrap!;
          const rad = (readingAngle(st.angle) * Math.PI) / 180;
          let nx = -Math.sin(rad);
          let ny = Math.cos(rad);
          if (nx * (st.x - cx) + ny * (st.y - cy) < 0) {
            nx = -nx;
            ny = -ny;
          }
          return { x: st.x, y: st.y, chipX: st.x + nx * 8.5, chipY: st.y + ny * 8.5 };
        })()
      : null;

    // Closed path + ~130 samples for the lap light.
    const dPath =
      pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ") + " Z";
    const step = Math.max(1, Math.floor(n / 130));
    const sampled: [number, number][] = [];
    for (let i = 0; i < n; i += step) sampled.push(pts[i]);

    // viewBox fits ribbon + pins + extrusion (pins can outrun the track edge).
    const lblXs = labels.flatMap((l) => [l.x - 2.6, l.x + 2.6]);
    const lblYs = labels.flatMap((l) => [l.y - 2.1, l.y + 2.1]);
    // Sector names are rotated along the track, so reserve a square around
    // each anchor — otherwise the viewBox crops the ends of the word.
    // The name is set along the track, so reserve a square around its anchor
    // — rotated text can reach either way.
    for (const band of sectorBands) {
      lblXs.push(band.anchor.x - 10, band.anchor.x + 10);
      lblYs.push(band.anchor.y - 10, band.anchor.y + 10);
    }
    if (trap) {
      lblXs.push(trap.chipX - 10.6, trap.chipX + 10.6);
      lblYs.push(trap.chipY - 3.4, trap.chipY + 3.4);
    }
    const vbX = Math.min(minX - EDGE_W / 2, ...lblXs) - 0.9;
    const vbY = Math.min(minY - EDGE_W / 2, ...lblYs) - 0.9;
    const vbX1 = Math.max(maxX + EDGE_W / 2, ...lblXs) + 0.9;
    const vbY1 = Math.max(maxY + drop + EDGE_W / 2, ...lblYs) + 0.9;
    return {
      vb: [vbX, vbY, vbX1 - vbX, vbY1 - vbY] as [number, number, number, number],
      dPath,
      sampled,
      labels,
      kerbDs,
      sectorBands,
      trap,
    };
  }, [geo, drop]);

  const { vb, dPath, sampled, labels, kerbDs, sectorBands, trap } = L;

  // The racing light + comet tail walk the sampled points.
  const lightRef = useRef<SVGCircleElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const tailA = useRef<SVGCircleElement>(null);
  const tailB = useRef<SVGCircleElement>(null);
  useEffect(() => {
    let raf = 0;
    let idx = 0;
    let last = performance.now();
    const DURATION = 11000; // one "lap" of the light
    const tick = (t: number) => {
      if (!sampled.length) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = t - last;
      last = t;
      idx = (idx + (dt / DURATION) * sampled.length) % sampled.length;
      const k = Math.min(sampled.length - 1, Math.floor(idx));
      const p = sampled[k];
      if (!p) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const set = (el: SVGCircleElement | null, q: [number, number] | undefined, fb: [number, number]) =>
        el && (el.setAttribute("cx", String(q ? q[0] : fb[0])), el.setAttribute("cy", String(q ? q[1] : fb[1])));
      set(lightRef.current, p, p);
      set(glowRef.current, p, p);
      set(tailA.current, sampled[Math.floor((idx - 1.7 + sampled.length) % sampled.length)], p);
      set(tailB.current, sampled[Math.floor((idx - 3.4 + sampled.length) % sampled.length)], p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sampled]);

  const [x0, y0] = geo.points[0] ?? [50, 50];

  return (
    <div className="circuit-3d-scene" aria-label={`${geo.circuitName || "Circuit"} 3D map`}>
      <div className={`circuit-3d-tilt${sectors ? " circuit-3d-deep" : ""}`}>
        <svg viewBox={vb.map((v) => v.toFixed(1)).join(" ")} className="circuit-3d-svg" role="img">
          <defs>
            <linearGradient id="trackSurface" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3d4046" />
              <stop offset="55%" stopColor="#26282d" />
              <stop offset="100%" stopColor="#17181b" />
            </linearGradient>
            <linearGradient id="trackGloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="lightGlow">
              <stop offset="0%" stopColor="#e10600" stopOpacity="0.55" />
              <stop offset="65%" stopColor="#e10600" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#e10600" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* EXTRUSION: the side wall — same path, offset down, drawn FIRST so
              the surface overlaps its top edge. Low profile: depth, not bulk.
              The wall is a touch lighter than the page so the plate reads as a
              solid model against the dark sheet. */}
          <path d={dPath} transform={`translate(0 ${drop + 1.4})`} fill="none" stroke="#16181d" strokeWidth={EDGE_W + 0.6} strokeLinejoin="round" />
          <path d={dPath} transform={`translate(0 ${drop})`} fill="none" stroke="#2a2e36" strokeWidth={EDGE_W} strokeLinejoin="round" />
          <path d={dPath} transform={`translate(0 ${drop - 0.6})`} fill="none" stroke="#454b56" strokeWidth={ASPHALT_W} strokeLinejoin="round" opacity="0.55" />

          {sectors ? (
            <>
              {/* F1 calendar layout: the same ribbon painted in three sector
                  bands, with the sector names on the outside of the lap. */}
              {sectorBands.map((band) => (
                <path
                  key={`${band.label}-edge`}
                  d={band.d}
                  fill="none"
                  stroke="#f2f3f4"
                  strokeWidth={EDGE_W}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity="0.8"
                />
              ))}
              {sectorBands.map((band) => (
                <path
                  key={band.label}
                  d={band.d}
                  fill="none"
                  stroke={band.colour}
                  strokeWidth={ASPHALT_W}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {sectorBands.map((band) => (
                <path
                  key={`${band.label}-gloss`}
                  d={band.d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={CORE_W}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity="0.14"
                />
              ))}
              {sectorBands.map((band) => (
                <text
                  key={`${band.label}-text`}
                  x={band.anchor.x}
                  y={band.anchor.y + 1}
                  transform={`rotate(${band.anchor.angle.toFixed(1)} ${band.anchor.x.toFixed(2)} ${band.anchor.y.toFixed(2)})`}
                  textAnchor="middle"
                  fontSize="2.9"
                  fontWeight="800"
                  letterSpacing="0.45"
                  fill={band.colour}
                  stroke="#050507"
                  strokeWidth="0.7"
                  paintOrder="stroke"
                >
                  {band.label}
                </text>
              ))}

              {/* speed trap, as marked on the official map */}
              {trap && (
                <g>
                  <line
                    x1={trap.x}
                    y1={trap.y}
                    x2={trap.chipX}
                    y2={trap.chipY}
                    stroke="#f000b8"
                    strokeWidth="0.5"
                    opacity="0.9"
                  />
                  <circle cx={trap.x} cy={trap.y} r="1" fill="#f000b8" stroke="#f4f5f7" strokeWidth="0.3" />
                  <rect
                    x={trap.chipX - 10.4}
                    y={trap.chipY - 3.1}
                    width="20.8"
                    height="6.2"
                    rx="0.9"
                    fill="#f000b8"
                    opacity="0.95"
                  />
                  <text
                    x={trap.chipX}
                    y={trap.chipY + 0.9}
                    textAnchor="middle"
                    fontSize="2.4"
                    fontWeight="800"
                    letterSpacing="0.05"
                    fill="#ffffff"
                  >
                    SPEED TRAP
                  </text>
                </g>
              )}
            </>
          ) : (
            <>
              {/* white outline peeking from under the asphalt */}
              <path d={dPath} fill="none" stroke="#f2f3f4" strokeWidth={EDGE_W} strokeLinejoin="round" opacity="0.8" />

              {/* track surface (full width, under the kerbs) */}
              <path d={dPath} fill="none" stroke="url(#trackSurface)" strokeWidth={ASPHALT_W} strokeLinejoin="round" strokeLinecap="round" />

              {/* kerbs: red base + white dashes at apex zones only; a narrower
                  asphalt core reduces them to rim stripes on the edges */}
              {kerbDs.map((d, i) => (
                <g key={i}>
                  <path d={d} fill="none" stroke="#e10600" strokeWidth={ASPHALT_W} strokeLinejoin="round" />
                  <path d={d} fill="none" stroke="#eceef0" strokeWidth={ASPHALT_W} strokeDasharray={`${KERB_CHUNK} ${KERB_CHUNK}`} strokeDashoffset={KERB_CHUNK} opacity="0.9" strokeLinejoin="round" />
                </g>
              ))}
              <path d={dPath} fill="none" stroke="url(#trackSurface)" strokeWidth={CORE_W} strokeLinejoin="round" strokeLinecap="round" />
              <path d={dPath} fill="none" stroke="url(#trackGloss)" strokeWidth={CORE_W} strokeLinejoin="round" />
            </>
          )}

          {/* start / finish: small white diamond on the centerline */}
          <rect x={x0 - 1.7} y={y0 - 1.7} width="3.4" height="3.4" rx="0.6" fill="#ffffff" opacity="0.95" transform={`rotate(45 ${x0} ${y0})`} />

          {/* corner pins: compact dark chip + number, popped in staggered */}
          {labels.map((c, i) => (
            <g key={c.number} className="circuit-corner" style={{ animationDelay: `${140 + i * 42}ms` }}>
              <rect
                x={c.x - 2.8}
                y={c.y - 1.95}
                width="5.6"
                height="3.9"
                rx="1.05"
                fill="rgba(9,10,11,0.9)"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="0.22"
              />
              <text x={c.x} y={c.y + 1} textAnchor="middle" fontSize="2.8" fontWeight="800" fill="rgba(255,255,255,0.94)" className="tabular-nums">
                {c.number}
              </text>
            </g>
          ))}

          {/* the racing light: comet tail, glow, white-ringed head. The
              calendar plate runs it a touch larger so the lap point reads. */}
          <circle ref={tailB} r={sectors ? 1.0 : 0.75} fill="#e10600" opacity="0.3" />
          <circle ref={tailA} r={sectors ? 1.25 : 0.95} fill="#e10600" opacity="0.5" />
          <circle ref={glowRef} cx={x0} cy={y0} r={sectors ? 4.8 : 3.8} fill="url(#lightGlow)">
            <animate attributeName="opacity" values="0.95;0.6;0.95" dur="1.1s" repeatCount="indefinite" />
          </circle>
          <circle ref={lightRef} cx={x0} cy={y0} r={sectors ? 1.6 : 1.25} fill="#e10600" stroke="#ffffff" strokeWidth="0.35">
            {!sectors && (
              <animate attributeName="r" values="1.2;1.35;1.2" dur="1.1s" repeatCount="indefinite" />
            )}
          </circle>
        </svg>
      </div>
      {/* soft ground shadow under the tilted plate */}
      <div className="circuit-3d-shadow" aria-hidden="true" />
      {sectors && (
        <div className="circuit-3d-hud" aria-hidden="true">
          <span className="circuit-3d-hud-item">
            {SECTOR_COLOURS.map((colour, i) => (
              <span key={colour} className="circuit-3d-hud-key">
                <span className="circuit-3d-hud-dot" style={{ background: colour }} />S{i + 1}
              </span>
            ))}
          </span>
          <span className="circuit-3d-hud-item">
            <span className="circuit-3d-hud-dot" style={{ background: "#f000b8" }} />Speed trap
          </span>
          <span className="circuit-3d-hud-item circuit-3d-hud-count">
            {geo.cornerCount} turns
          </span>
        </div>
      )}
    </div>
  );
}

// ------------------------------ fallback tilt --------------------------------

function TiltedImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="circuit-3d-scene" aria-label={alt}>
      <div className="circuit-3d-tilt">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full invert" draggable={false} />
      </div>
      <div className="circuit-3d-shadow" aria-hidden="true" />
    </div>
  );
}
