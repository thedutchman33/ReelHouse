"use client";

import type { PlaybackServer } from "@/types";
import { CheckCircleIcon, HeartFilledIcon, HeartIcon } from "./icons";

function CountryBadge({ code }: { code: string }) {
  return (
    <span className="inline-flex h-7 min-w-[2.1rem] items-center justify-center rounded-md bg-surface px-1.5 text-[11px] font-bold tracking-wide text-muted ring-1 ring-inset ring-border">
      {code}
    </span>
  );
}

// Mock server picker. Cards are opaque, provider-agnostic PlaybackServer data
// resolved server-side — the UI has no idea which concrete provider produced
// them, so a real provider can replace the mock with zero UI changes.
export default function ServerPanel({
  servers,
  selectedId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
}: {
  servers: PlaybackServer[];
  selectedId: string;
  favoriteIds: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  // Favorites float to the top, otherwise keep provider order.
  const ordered = [...servers].sort((a, b) => {
    const fa = favoriteIds.includes(a.id) ? 0 : 1;
    const fb = favoriteIds.includes(b.id) ? 0 : 1;
    return fa - fb;
  });

  return (
    <div className="space-y-2">
      {ordered.map((s) => {
        const active = s.id === selectedId;
        const fav = favoriteIds.includes(s.id);
        return (
          <div
            key={s.id}
            className={[
              "flex items-center gap-3 rounded-xl border px-3 py-3 transition",
              active
                ? "border-accent/70 bg-accent/10"
                : "border-border bg-surface-2/40 hover:bg-surface-2",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-pressed={active}
            >
              <CountryBadge code={s.countryCode} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-text">{s.name}</span>
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-inset ring-border">
                    {s.qualityLabel}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{s.audioLabel}</span>
              </span>
              {active && <CheckCircleIcon size={20} className="shrink-0 text-accent" />}
            </button>

            <button
              type="button"
              onClick={() => onToggleFavorite(s.id)}
              aria-label={fav ? `Unfavorite ${s.name}` : `Favorite ${s.name}`}
              aria-pressed={fav}
              className={[
                "shrink-0 rounded-full p-1.5 transition hover:bg-white/10",
                fav ? "text-accent" : "text-muted",
              ].join(" ")}
            >
              {fav ? <HeartFilledIcon size={18} /> : <HeartIcon size={18} />}
            </button>
          </div>
        );
      })}
      <p className="px-1 pt-1 text-xs text-muted">
        Every source here resolves to the bundled licensed sample.
      </p>
    </div>
  );
}
