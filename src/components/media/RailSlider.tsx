"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// ---------------------------------------------------------------------------
// Episode rail scrubber (reference .ep-rail-slider, REA-reverse-engineered).
//
// The reference's episode scrollbar is NOT a native scrollbar — the rail hides
// it and a styled <input type="range"> sits 12px below the rail instead:
//
//   range 0–1000  <->  rail.scrollLeft / (scrollWidth - clientWidth)
//
// verified behaviorally in both directions (scroll 400/1160 → value 345;
// value 600 → scrollLeft 696). Geometry: 16px tall, full rail width, inset
// neumorphic track (#161817 pill), 72×16 green-gradient pill thumb
// (linear-gradient(#6fb899, #4a9675), brighter while active). Hidden when the
// rail doesn't overflow.
// ---------------------------------------------------------------------------

const RANGE_MAX = 1000;

export default function RailSlider({
  railRef,
  label = "Scrub episodes",
}: {
  railRef: RefObject<HTMLDivElement | null>;
  label?: string;
}) {
  const [value, setValue] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  // Dragging the slider writes scrollLeft; the rail's own scroll event then
  // echoes back — harmless, but the guard keeps dragging from fighting itself.
  const dragging = useRef(false);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setMaxScroll(max > 0 ? max : 0);
      if (!dragging.current) {
        setValue(max > 0 ? Math.round((el.scrollLeft / max) * RANGE_MAX) : 0);
      }
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Rail content (lazy episodes, season switches) changes scrollWidth.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [railRef]);

  if (maxScroll <= 0) return null;

  return (
    <input
      type="range"
      min={0}
      max={RANGE_MAX}
      value={value}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.currentTarget.value);
        setValue(v);
        const el = railRef.current;
        if (el) el.scrollLeft = (v / RANGE_MAX) * (el.scrollWidth - el.clientWidth);
      }}
      onPointerDown={() => {
        dragging.current = true;
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      className="rail-slider mt-3 w-full cursor-pointer"
      draggable={false}
    />
  );
}
