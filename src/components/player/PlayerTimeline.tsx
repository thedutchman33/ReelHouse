"use client";

import { useCallback, useRef, useState } from "react";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Progress timeline with buffered fill, played fill, a draggable knob, and
// elapsed / total readout. Click or drag (pointer + touch) to seek.
export default function PlayerTimeline({
  currentTime,
  duration,
  buffered,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: {
  currentTime: number;
  duration: number;
  buffered: number;
  onSeek: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const dur = duration > 0 ? duration : 0;
  const shown = preview ?? currentTime;
  const playedPct = dur ? Math.min(100, (shown / dur) * 100) : 0;
  const bufferedPct = dur ? Math.min(100, (buffered / dur) * 100) : 0;

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || !dur) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * dur;
    },
    [dur]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!dur) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubbing(true);
    onScrubStart?.();
    const t = timeFromClientX(e.clientX);
    setPreview(t);
    onSeek(t);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!scrubbing) return;
    const t = timeFromClientX(e.clientX);
    setPreview(t);
    onSeek(t);
  };

  const endScrub = (e: React.PointerEvent) => {
    if (!scrubbing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (preview != null) onSeek(preview);
    setScrubbing(false);
    setPreview(null);
    onScrubEnd?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!dur) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      onSeek(Math.min(dur, currentTime + 5));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onSeek(Math.max(0, currentTime - 5));
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${fmt(shown)} of ${fmt(dur)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onKeyDown={onKeyDown}
        className="group relative flex-1 cursor-pointer touch-none select-none py-3"
      >
        {/* Base rail */}
        <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] group-hover:h-1.5">
          {/* Buffered */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/30"
            style={{ width: `${bufferedPct}%` }}
          />
          {/* Played */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${playedPct}%` }}
          />
          {/* Knob */}
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow ring-2 ring-black/40 transition-transform group-hover:scale-110"
            style={{ left: `${playedPct}%` }}
          />
        </div>
      </div>

      <div className="shrink-0 text-xs font-medium tabular-nums text-white/85 sm:text-sm">
        {fmt(shown)} <span className="text-white/45">/ {fmt(dur)}</span>
      </div>
    </div>
  );
}
