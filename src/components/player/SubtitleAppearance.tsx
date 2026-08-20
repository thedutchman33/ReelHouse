"use client";

import {
  DEFAULT_APPEARANCE,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LATENCY_MAX,
  LATENCY_MIN,
  SUBTITLE_COLORS,
  type SubtitleAppearance,
} from "./constants";
import { ChevronLeftIcon, ResetIcon } from "./icons";

function Slider({
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text">{label}</span>
        <span className="text-sm tabular-nums text-muted">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
        aria-label={label}
      />
    </div>
  );
}

// Customize how captions look. All values operate locally/in memory because
// authentication is not implemented yet — "Save to account" mirrors to this
// device and shows where account sync will hook in later.
export default function SubtitleAppearance({
  appearance,
  hasCaption,
  onChange,
  onReset,
  onSave,
  saved,
  onBack,
}: {
  appearance: SubtitleAppearance;
  hasCaption: boolean;
  onChange: (patch: Partial<SubtitleAppearance>) => void;
  onReset: () => void;
  onSave: () => void;
  saved: boolean;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 self-start text-sm font-medium text-muted transition hover:text-text"
      >
        <ChevronLeftIcon size={18} />
        Back to subtitles
      </button>

      <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar pr-1">
        <Slider
          label="Font size"
          value={appearance.fontSize}
          valueLabel={`${appearance.fontSize}px`}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          step={1}
          onChange={(v) => onChange({ fontSize: v })}
        />

        <Slider
          label="Background blur"
          value={appearance.blur}
          valueLabel={`${appearance.blur}%`}
          min={0}
          max={100}
          step={1}
          onChange={(v) => onChange({ blur: v })}
        />

        <div>
          <span className="mb-3 block text-sm font-medium text-text">Color</span>
          <div className="grid grid-cols-6 gap-3">
            {SUBTITLE_COLORS.map((c) => {
              const active = c.value.toLowerCase() === appearance.color.toLowerCase();
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChange({ color: c.value })}
                  aria-label={c.label}
                  aria-pressed={active}
                  className={[
                    "aspect-square w-full rounded-full ring-1 ring-inset ring-black/30 transition",
                    active
                      ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
                      : "hover:scale-110",
                  ].join(" ")}
                  style={{ backgroundColor: c.value }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-text">Latency</span>
          {hasCaption ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-muted">Shift caption timing</span>
                <span className="text-sm tabular-nums text-muted">
                  {appearance.latency > 0 ? "+" : ""}
                  {appearance.latency.toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min={LATENCY_MIN}
                max={LATENCY_MAX}
                step={0.1}
                value={appearance.latency}
                onChange={(e) => onChange({ latency: Number(e.target.value) })}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-accent"
                aria-label="Latency"
              />
            </>
          ) : (
            <p className="rounded-lg bg-surface-2/50 px-3 py-2 text-xs text-muted">
              You haven&apos;t selected a caption track yet.
            </p>
          )}
        </div>

        {/* Live preview */}
        <div>
          <span className="mb-2 block text-sm font-medium text-text">Preview</span>
          <div className="grid place-items-center rounded-xl bg-black/70 px-4 py-6">
            <span
              className="rounded px-2 py-1 text-center leading-snug"
              style={{
                fontSize: `${appearance.fontSize}px`,
                color: appearance.color,
                backgroundColor: appearance.blur > 0 ? "rgba(0,0,0,0.35)" : "transparent",
                backdropFilter: appearance.blur > 0 ? `blur(${appearance.blur / 5}px)` : undefined,
                textShadow: "0 1px 3px rgba(0,0,0,0.85)",
              }}
            >
              The quick brown fox
            </span>
          </div>
        </div>
      </div>

      {/* Pinned actions */}
      <div className="mt-3 space-y-2 border-t border-border pt-3">
        {saved && (
          <p className="text-center text-xs text-accent">
            Saved on this device — account sync arrives with sign-in.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2/60 px-4 py-2.5 text-sm font-semibold text-text transition hover:bg-surface-2"
          >
            <ResetIcon size={16} />
            Reset
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-strong"
          >
            Save to account
          </button>
        </div>
      </div>
    </div>
  );
}

// Re-export so the orchestrator can reset to a known baseline.
export { DEFAULT_APPEARANCE };
