"use client";

import { QUALITY_OPTIONS } from "./constants";
import { CheckIcon } from "./icons";

// Quality picker. A single bundled MP4 has no real renditions, so selection
// only updates UI state here — a live provider would expose true variants.
export default function QualityPanel({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {QUALITY_OPTIONS.map((q) => {
        const active = q.id === selected;
        return (
          <button
            key={q.id}
            type="button"
            onClick={() => onSelect(q.id)}
            className={[
              "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition",
              active
                ? "border-accent/70 bg-accent/10 text-text"
                : "border-border bg-surface-2/40 text-text hover:bg-surface-2",
            ].join(" ")}
          >
            <span className="font-medium">{q.label}</span>
            {active ? (
              <CheckIcon size={18} className="text-accent" />
            ) : q.height ? (
              <span className="text-xs text-muted">{q.height}p</span>
            ) : (
              <span className="text-xs text-muted">Adaptive</span>
            )}
          </button>
        );
      })}
      <p className="px-1 pt-1 text-xs text-muted">
        This source has a single rendition — selection is illustrative.
      </p>
    </div>
  );
}
