"use client";

import { useId } from "react";
import { boundaryLabel, type VenueDimensions } from "@/lib/cricket/venue-boundaries";

// A 3D ground plate in the same slot and visual language as the F1 circuit
// map: bowl, stands, boundary, 30-yard circle, pitch and floodlights. It is a
// venue graphic, not a survey.

const STANDS = [
  { from: -168, to: -132 },
  { from: -130, to: -96 },
  { from: -94, to: -60 },
  { from: -58, to: -24 },
  { from: -22, to: 12 },
  { from: 14, to: 48 },
  { from: 50, to: 84 },
  { from: 86, to: 120 },
];

function polar(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
}

function wedgePath(
  cx: number,
  cy: number,
  rxo: number,
  ryo: number,
  rxi: number,
  ryi: number,
  from: number,
  to: number
) {
  const a = polar(cx, cy, rxo, ryo, from);
  const b = polar(cx, cy, rxo, ryo, to);
  const c = polar(cx, cy, rxi, ryi, to);
  const d = polar(cx, cy, rxi, ryi, from);
  return [
    `M ${a.x.toFixed(2)} ${a.y.toFixed(2)}`,
    `A ${rxo} ${ryo} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`,
    `L ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
    `A ${rxi} ${ryi} 0 0 0 ${d.x.toFixed(2)} ${d.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export default function StadiumPlot({
  venueName,
  city,
  dimensions = null,
  className = "",
}: {
  venueName: string;
  city: string | null;
  dimensions?: VenueDimensions | null;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const outfieldId = `ck-out-${uid}`;
  const standId = `ck-stand-${uid}`;
  const grassId = `ck-grass-${uid}`;
  const arrowId = `ck-arrow-${uid}`;
  const prefix = dimensions?.approx ? "~" : "";
  const straightNorth = dimensions?.north ?? dimensions?.straight;
  const straightSouth = dimensions?.south ?? dimensions?.straight;
  const squareWest = dimensions?.west ?? dimensions?.square;
  const squareEast = dimensions?.east ?? dimensions?.square;

  return (
    <div className={`ck-stadium-scene ${className}`}>
      <div className="ck-stadium-shadow" aria-hidden="true" />
      <div className="ck-stadium-tilt">
        <svg
          viewBox="0 0 600 430"
          role="img"
          aria-label={`${venueName}${city ? `, ${city}` : ""} ground layout with a 22-yard pitch, 30-yard inner circle${
            dimensions
              ? `, and boundary distances of ${boundaryLabel(dimensions.straight)} straight and ${boundaryLabel(dimensions.square)} square`
              : ""
          }`}
          className="ck-stadium-svg"
        >
          <defs>
            <radialGradient id={outfieldId} cx="50%" cy="45%" r="62%">
              <stop offset="0%" stopColor="#2f8a52" />
              <stop offset="62%" stopColor="#1f6a3d" />
              <stop offset="100%" stopColor="#123f27" />
            </radialGradient>
            <linearGradient id={standId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#284875" />
              <stop offset="52%" stopColor="#193457" />
              <stop offset="100%" stopColor="#0f2138" />
            </linearGradient>
            <pattern id={grassId} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
              <rect width="26" height="13" fill="#ffffff" opacity="0.028" />
            </pattern>
            <marker
              id={arrowId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 10 5 0 10z" fill="#c8ecff" />
            </marker>
          </defs>

          <ellipse cx="300" cy="222" rx="272" ry="184" fill="#040a14" opacity="0.85" />
          <ellipse cx="300" cy="208" rx="266" ry="176" fill="#0a1628" />

          <g>
            {STANDS.map((stand, index) => (
              <g key={`${stand.from}-${stand.to}`} className="ck-stand" style={{ animationDelay: `${index * 45}ms` }}>
                <path
                  d={wedgePath(300, 204, 250, 164, 196, 124, stand.from, stand.to)}
                  fill={`url(#${standId})`}
                  stroke="rgba(143,180,236,0.28)"
                  strokeWidth="1"
                  className="transition-[filter] duration-200 hover:brightness-125"
                />
                <path
                  d={wedgePath(300, 204, 250, 164, 196, 124, stand.from + 2, stand.to - 2)}
                  fill="none"
                  stroke="rgba(185,229,248,0.13)"
                  strokeWidth="0.7"
                  strokeDasharray="3 5"
                />
              </g>
            ))}
          </g>

          <ellipse cx="300" cy="204" rx="196" ry="124" fill="#0c1c35" stroke="rgba(143,180,236,0.3)" strokeWidth="1.2" />
          <ellipse cx="300" cy="204" rx="190" ry="119" fill="#081426" />
          <ellipse cx="300" cy="204" rx="184" ry="114" fill={`url(#${outfieldId})`} />
          <ellipse cx="300" cy="204" rx="184" ry="114" fill={`url(#${grassId})`} />

          <g fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="7">
            <ellipse cx="300" cy="204" rx="160" ry="98" />
            <ellipse cx="300" cy="204" rx="132" ry="80" />
            <ellipse cx="300" cy="204" rx="104" ry="62" />
          </g>

          <ellipse cx="300" cy="204" rx="178" ry="109" fill="none" stroke="#d9af6b" strokeWidth="1.6" strokeOpacity="0.85" />
          <ellipse cx="300" cy="204" rx="128" ry="78" fill="none" stroke="#b9e5f8" strokeWidth="1" strokeDasharray="4 6" strokeOpacity="0.45" />

          <g>
            <rect x="283" y="147" width="34" height="114" rx="2" fill="#c9a35f" opacity="0.95" />
            <rect x="286" y="150" width="28" height="108" rx="1" fill="#ddba7b" opacity="0.65" />
            <g stroke="#f4efe2" strokeWidth="1.1" opacity="0.9">
              <path d="M287 163h26M287 169h26M287 239h26M287 245h26" />
              <path d="M292 157v-5M308 157v-5M292 251v5M308 251v5" />
            </g>
            <g fill="#f8f5ea">
              <rect x="297" y="156" width="1.4" height="6" />
              <rect x="300.5" y="156" width="1.4" height="6" />
              <rect x="304" y="156" width="1.4" height="6" />
              <rect x="297" y="246" width="1.4" height="6" />
              <rect x="300.5" y="246" width="1.4" height="6" />
              <rect x="304" y="246" width="1.4" height="6" />
            </g>
          </g>

          {/* Ground dimensions: the 22-yard pitch strip plus the real rope
              distances for this venue, drawn from the pitch centre. */}
          <g stroke="#d9af6b" strokeOpacity="0.48" strokeWidth="0.8" fill="none">
            <path d="M274 147h5M274 261h5M277 147v114" />
            <path d="M271 201l3-4 3 4M271 207l3 4 3-4" />
          </g>
          <text x="268" y="208" textAnchor="end" fontSize="6.8" fontWeight="700" fill="#d9af6b" transform="rotate(-90 268 208)" letterSpacing="0.8">
            22 YD
          </text>

          {dimensions && (
            <g className="ck-boundary-arrows" style={{ filter: "drop-shadow(0 0 4px rgb(185 229 248 / 0.45))" }}>
              {[
                { x1: 300, y1: 186, x2: 300, y2: 97, value: straightNorth, tx: 300, ty: 82, anchor: "middle" as const },
                { x1: 300, y1: 222, x2: 300, y2: 311, value: straightSouth, tx: 300, ty: 334, anchor: "middle" as const },
                { x1: 284, y1: 204, x2: 125, y2: 204, value: squareWest, tx: 112, ty: 210, anchor: "end" as const },
                { x1: 316, y1: 204, x2: 475, y2: 204, value: squareEast, tx: 488, ty: 210, anchor: "start" as const },
              ].map((arrow, index) => (
                <g key={index}>
                  <line
                    x1={arrow.x1}
                    y1={arrow.y1}
                    x2={arrow.x2}
                    y2={arrow.y2}
                    stroke="#c8ecff"
                    strokeWidth="2"
                    strokeOpacity="0.9"
                    markerEnd={`url(#${arrowId})`}
                    className="ck-boundary-line"
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                  <text
                    x={arrow.tx}
                    y={arrow.ty}
                    textAnchor={arrow.anchor}
                    fontSize="24"
                    fontWeight="800"
                    fill="#f7fbff"
                    stroke="#06101e"
                    strokeWidth="3.6"
                    paintOrder="stroke"
                    letterSpacing="0.2"
                  >
                    {prefix}
                    {boundaryLabel(arrow.value)}
                  </text>
                </g>
              ))}
            </g>
          )}

          {[
            { x: 66, y: 92 },
            { x: 534, y: 92 },
            { x: 66, y: 318 },
            { x: 534, y: 318 },
          ].map((point, index) => (
            <g key={`${point.x}-${point.y}`} className="ck-floodlight" style={{ animationDelay: `${index * 320}ms` }}>
              <line x1={point.x} y1={point.y} x2={point.x} y2={point.y + 26} stroke="#3a4f73" strokeWidth="3" />
              <rect x={point.x - 15} y={point.y - 9} width="30" height="9" rx="2" fill="#1d3c74" stroke="rgba(185,229,248,0.4)" strokeWidth="0.8" />
              {[-11, -5.5, 0, 5.5, 11].map((dx) => (
                <circle key={dx} cx={point.x + dx} cy={point.y - 4.5} r="1.7" fill="#f5e7bd" />
              ))}
              <ellipse cx={point.x} cy={point.y + 4} rx="34" ry="15" fill="#f5e7bd" opacity="0.055" />
            </g>
          ))}

          <g fill="#8fb4ec" fontSize="8.5" fontWeight="700" letterSpacing="2.2" opacity="0.8">
            <text x="300" y="34" textAnchor="middle">PAVILION</text>
            <text x="300" y="392" textAnchor="middle">SCOREBOARD</text>
          </g>

          <g transform="translate(553 372)" opacity="0.65">
            <circle r="13" fill="none" stroke="#8fb4ec" strokeOpacity="0.4" strokeWidth="0.8" />
            <path d="M0 -9l4 9h-8z" fill="#d9af6b" />
            <text y="-17" textAnchor="middle" fill="#8fb4ec" fontSize="7" fontWeight="700">N</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
