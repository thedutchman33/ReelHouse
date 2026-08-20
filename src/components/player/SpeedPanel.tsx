"use client";

import { SPEED_OPTIONS } from "./constants";
import { CheckIcon } from "./icons";

// Playback speed picker. This is real — it maps to HTMLMediaElement.playbackRate.
export default function SpeedPanel({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (rate: number) => void;
}) {
  return (
    <div className="space-y-2">
      {SPEED_OPTIONS.map((rate) => {
        const active = rate === selected;
        return (
          <button
            key={rate}
            type="button"
            onClick={() => onSelect(rate)}
            className={[
              "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition",
              active
                ? "border-accent/70 bg-accent/10 text-text"
                : "border-border bg-surface-2/40 text-text hover:bg-surface-2",
            ].join(" ")}
          >
            <span className="font-medium">{rate === 1 ? "Normal" : `${rate}×`}</span>
            {active && <CheckIcon size={18} className="text-accent" />}
          </button>
        );
      })}
    </div>
  );
}
