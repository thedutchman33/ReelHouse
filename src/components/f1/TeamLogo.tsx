"use client";

import { useState } from "react";
import { teamLogo, teamLogoWidth, teamMonoLogo } from "@/lib/f1-teams";

// The colour PNGs are dark artwork on white, so they sit on a small white
// plate. The standings logo column instead uses the reference's white SVG
// marks (`mono/`), drawn straight on the card — `TeamMark` covers both so every
// F1 view can share one logo set.
//
// Each plate is sized from the mark's own aspect ratio: a fixed-width plate
// turns Mercedes' tall star (or McLaren's square swoosh) into a sliver.
export function TeamMark({
  team,
  size = 20,
  tone = "tile",
}: {
  team: string;
  size?: number;
  /** "mono" draws the trimmed white SVG mark straight on the card. */
  tone?: "tile" | "mono";
}) {
  const src = teamLogo(team);
  const mono = tone === "mono" ? teamMonoLogo(team) : null;
  if (mono) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center"
        style={{ height: size, width: Math.round(size * 1.5) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mono}
          alt=""
          loading="eager"
          className="h-auto w-auto object-contain"
          style={{ maxHeight: size, maxWidth: Math.round(size * 1.5) }}
        />
      </span>
    );
  }
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center rounded-[3px] border border-white/10 bg-white/[0.06] font-f1 text-[8px] font-bold text-white/55"
        style={{ height: size, width: Math.round(size * 1.55) }}
      >
        {team.slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[3px] bg-white p-[2px]"
      style={{ height: size, width: Math.round(size * 1.55) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden="true" loading="eager" className="max-h-full max-w-full object-contain" />
    </span>
  );
}

/** Driver identity for HTML rows: the headshot when the feed ships one, else a
 *  team-colour circle with the driver's initials. */
export function DriverAvatar({
  name,
  colour,
  headshotUrl,
  size = 22,
}: {
  name: string;
  colour: string;
  headshotUrl?: string | null;
  size?: number;
}) {
  const hex = colour.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  // A portrait URL that fails to load must not leave an empty disc behind: the
  // initials take over instead (the F1 CDN answers some paths with a blank).
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const showPhoto = Boolean(headshotUrl) && brokenUrl !== headshotUrl;
  return (
    <span
      aria-hidden="true"
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-black/50"
      style={{ height: size, width: size, backgroundColor: colour }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={headshotUrl ?? undefined}
          alt=""
          loading="eager"
          decoding="async"
          className="h-full w-full object-cover object-top"
          onError={() => setBrokenUrl(headshotUrl ?? null)}
        />
      ) : (
        <span
          className="font-f1 font-bold leading-none"
          style={{ color: luma > 0.62 ? "#0b0b10" : "#ffffff", fontSize: Math.max(7.5, Math.round(size * 0.36)) }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}

/** A team mark inside an SVG chart. Current teams use the white mono mark; the
 *  white plate + colour PNG stays as the fallback for historic teams. */
export function SvgTeamLogo({
  team,
  x,
  y,
  height,
  width,
}: {
  team: string;
  x: number;
  y: number;
  height: number;
  width?: number;
}) {
  const mono = teamMonoLogo(team);
  const w = width ?? Math.round(height * 1.5);
  if (mono) {
    return (
      <image
        href={mono}
        x={x}
        y={y}
        width={w}
        height={height}
        preserveAspectRatio="xMidYMid meet"
        pointerEvents="none"
      />
    );
  }
  const src = teamLogo(team);
  if (!src) return null;
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={w} height={height} rx={2.5} fill="#ffffff" />
      <image
        href={src}
        x={x + 2}
        y={y + 2}
        width={Math.max(1, w - 4)}
        height={Math.max(1, height - 4)}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  );
}
